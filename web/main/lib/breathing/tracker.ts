/**
 * Temporal BPM tracker. Treats the breathing rate as a slowly-varying
 * scalar state and combines successive spectral measurements with a
 * Kalman-style update. The result: noisy single-shot estimates are
 * smoothed into a stable "current BPM" that can lock onto a value and
 * resist transient camera-shake disagreement.
 *
 * State machine:
 *  - Uninitialized: first valid measurement seeds the state.
 *  - Initialized but unlocked: each measurement nudges the state via
 *    Kalman gain. Variance shrinks as consistent measurements arrive.
 *  - Locked: variance has fallen below a threshold for N consecutive
 *    estimates. The displayed value is treated as authoritative.
 *  - Outlier streak: measurements > outlierZ × innovation σ in a row
 *    are discarded, but if the streak exceeds resetStreak the state
 *    snaps to the new value (the breathing rate genuinely changed, e.g.,
 *    the dog started panting).
 */

export type TrackerState = {
	bpm: number;
	variance: number; // BPM²
	innovationStd: number; // most recent observation's σ in BPM
	isLocked: boolean;
	lockAge: number; // estimates spent below lockVariance
	outlierStreak: number;
	initialized: boolean;
};

export type BpmTracker = {
	update(measuredBpm: number, measurementVariance: number): void;
	reset(): void;
	getState(): TrackerState;
	/** Variance to feed into a downstream consumer (`null` if uninitialized). */
	displayBpm(): number | null;
};

export type TrackerOptions = {
	/** BPM² drift the state allows per estimate (real BPM does change slowly). */
	processNoise?: number;
	/** Variance threshold (BPM²) below which we declare lock. */
	lockVariance?: number;
	/** Consecutive estimates below `lockVariance` required to flip to locked. */
	lockFrames?: number;
	/** Z-score above which a measurement is rejected as an outlier. */
	outlierZ?: number;
	/** Consecutive outliers required to force-snap state to new value. */
	resetStreak?: number;
	/** Initial variance for first measurement (BPM²). */
	initialVariance?: number;
};

const DEFAULTS: Required<TrackerOptions> = {
	processNoise: 0.06,
	lockVariance: 4,
	lockFrames: 4,
	outlierZ: 3,
	resetStreak: 8,
	initialVariance: 36,
};
// Once locked, demand more disagreement before discarding measurements
// and a much longer streak before snapping to a new value. Brief
// environmental noise can't dislodge a real lock; only a sustained
// genuine BPM change does.
const LOCKED_OUTLIER_MULTIPLIER = 1.7;
const LOCKED_RESET_MULTIPLIER = 2;

export function createBpmTracker(options: TrackerOptions = {}): BpmTracker {
	const opts = { ...DEFAULTS, ...options };

	let state: TrackerState = freshState();

	function freshState(): TrackerState {
		return {
			bpm: 0,
			variance: opts.initialVariance,
			innovationStd: Math.sqrt(opts.initialVariance),
			isLocked: false,
			lockAge: 0,
			outlierStreak: 0,
			initialized: false,
		};
	}

	return {
		update(measuredBpm: number, measurementVariance: number) {
			if (!Number.isFinite(measuredBpm)) return;
			if (!state.initialized) {
				state.bpm = measuredBpm;
				state.variance = Math.max(measurementVariance, opts.initialVariance);
				state.innovationStd = Math.sqrt(state.variance);
				state.initialized = true;
				return;
			}

			const innovation = measuredBpm - state.bpm;
			const S = state.variance + measurementVariance;
			const innovationStd = Math.sqrt(S);
			state.innovationStd = innovationStd;

			const outlierZThreshold = state.isLocked
				? opts.outlierZ * LOCKED_OUTLIER_MULTIPLIER
				: opts.outlierZ;
			const effectiveResetStreak = state.isLocked
				? Math.round(opts.resetStreak * LOCKED_RESET_MULTIPLIER)
				: opts.resetStreak;
			if (Math.abs(innovation) > outlierZThreshold * innovationStd) {
				state.outlierStreak++;
				if (state.outlierStreak >= effectiveResetStreak) {
					state.bpm = measuredBpm;
					state.variance = Math.max(
						measurementVariance,
						opts.initialVariance / 2,
					);
					state.isLocked = false;
					state.lockAge = 0;
					state.outlierStreak = 0;
				}
				return;
			}

			const K = state.variance / S;
			state.bpm += K * innovation;
			state.variance = (1 - K) * state.variance + opts.processNoise;
			state.outlierStreak = 0;

			if (state.variance < opts.lockVariance) {
				state.lockAge++;
				if (state.lockAge >= opts.lockFrames) state.isLocked = true;
			} else {
				state.lockAge = 0;
				state.isLocked = false;
			}
		},
		reset() {
			state = freshState();
		},
		getState() {
			return { ...state };
		},
		displayBpm() {
			return state.initialized ? state.bpm : null;
		},
	};
}

/**
 * Heuristic mapping from spectral SNR + composite quality to a BPM
 * measurement variance. Lower SNR / lower quality → higher variance →
 * Kalman update barely moves the state. Empirical floor at 0.5 BPM²
 * (about ±0.7 BPM uncertainty even for perfect measurements).
 */
export function bpmMeasurementVariance(snr: number, quality: number): number {
	const snrTerm = 30 / Math.max(snr, 1);
	const qualityPenalty = Math.max(1, 70 / Math.max(quality, 25));
	return Math.max(0.5, snrTerm * qualityPenalty);
}
