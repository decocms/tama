export type QualityInputs = {
	spectralSnr: number;
	spectralPeakNormalized: number; // peak power / band power, 0..1
	regularityCV: number | null;
	aliveFeatures: number;
	targetFeatures: number;
	shakeFraction: number;
	exposureJumpRecent: boolean;
	cycleCount: number;
};

export type QualityScore = {
	total: number;
	breakdown: {
		spectral: number;
		peakSharpness: number;
		regularity: number;
		featureHealth: number;
		shakePenalty: number;
		exposurePenalty: number;
	};
};

/**
 * Composite reliability score 0..100. Combines spectral SNR, peak
 * sharpness, rhythm regularity, and tracker health; subtracts penalties
 * for camera shake and exposure events. Each piece is bounded so a
 * single weak component can't drag the total below the others.
 */
export function computeQuality(inputs: QualityInputs): QualityScore {
	const spectral =
		clamp01(Math.log10(Math.max(inputs.spectralSnr, 1)) / 1.5) * 30;
	const peakSharpness = clamp01(inputs.spectralPeakNormalized * 5) * 20;
	const regularity =
		inputs.regularityCV != null && inputs.cycleCount >= 3
			? clamp01(1 - inputs.regularityCV / 0.5) * 25
			: 10;
	const featureHealth =
		inputs.targetFeatures > 0
			? clamp01(inputs.aliveFeatures / inputs.targetFeatures) * 25
			: 12;
	const shakePenalty = inputs.shakeFraction * 25;
	const exposurePenalty = inputs.exposureJumpRecent ? 10 : 0;
	const total = Math.max(
		0,
		Math.min(
			100,
			spectral +
				peakSharpness +
				regularity +
				featureHealth -
				shakePenalty -
				exposurePenalty,
		),
	);
	return {
		total: Math.round(total),
		breakdown: {
			spectral: Math.round(spectral),
			peakSharpness: Math.round(peakSharpness),
			regularity: Math.round(regularity),
			featureHealth: Math.round(featureHealth),
			shakePenalty: -Math.round(shakePenalty),
			exposurePenalty: -Math.round(exposurePenalty),
		},
	};
}

/**
 * Detect autofocus/exposure events from sudden frame-mean luminance
 * jumps. Compares the current frame's mean against the recent average;
 * returns true when the deviation exceeds `threshold` (in 8-bit luma
 * units).
 */
export function detectExposureJump(
	recentMeans: number[],
	currentMean: number,
	threshold = 6,
): boolean {
	if (recentMeans.length < 4) return false;
	let avg = 0;
	for (const v of recentMeans) avg += v;
	avg /= recentMeans.length;
	return Math.abs(currentMean - avg) > threshold;
}

function clamp01(v: number): number {
	if (v < 0) return 0;
	if (v > 1) return 1;
	return v;
}
