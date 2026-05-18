import { Activity, AlertCircle, Lock, Sparkles, Wind, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import {
	BPM_MAX,
	BPM_MIN,
	type BreathingEstimate,
	createBreathingEstimator,
} from "../lib/breathing.ts";

const ROI_W = 80;
const ROI_H = 60;
const GLOBAL_W = 40;
const GLOBAL_H = 30;
const SAMPLE_RATE_HZ = 30;
const WAVEFORM_SAMPLES = SAMPLE_RATE_HZ * 12;
const DISPLAY_BPM_SMOOTHING = 0.35;

type RoiFrac = { x: number; y: number; w: number; h: number };
const DEFAULT_ROI: RoiFrac = { x: 0.3, y: 0.35, w: 0.4, h: 0.3 };

const emptyEstimate: BreathingEstimate = {
	bpm: null,
	bpmSd: null,
	regularityCV: null,
	cycleCount: 0,
	quality: {
		total: 0,
		breakdown: {
			spectral: 0,
			peakSharpness: 0,
			regularity: 0,
			featureHealth: 0,
			shakePenalty: 0,
			exposurePenalty: 0,
		},
	},
	samplesReady: 0,
	bufferSeconds: 0,
	shakeRecent: false,
	exposureJumpRecent: false,
	aliveFeatures: 0,
	breathOffsets: [],
	isLocked: false,
	lockAge: 0,
	trackerVariance: 0,
	displayState: "uninitialized",
};

export function BreathingCounter({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const captureCanvasRef = useRef<HTMLCanvasElement>(null);
	const globalCanvasRef = useRef<HTMLCanvasElement>(null);
	const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
	const profileCanvasRef = useRef<HTMLCanvasElement>(null);
	const cornersLayerRef = useRef<HTMLCanvasElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const rafRef = useRef<number | null>(null);
	const globalLumaARef = useRef<Uint8Array | null>(null);
	const globalLumaBRef = useRef<Uint8Array | null>(null);
	const frameCountRef = useRef(0);
	const lastSampleAtRef = useRef(0);
	const lastBreathCountRef = useRef(0);
	const displayedBpmRef = useRef<number | null>(null);

	const estimator = useMemo(() => createBreathingEstimator(), []);
	const [roi, setRoi] = useState<RoiFrac>(DEFAULT_ROI);
	const [estimate, setEstimate] = useState<BreathingEstimate>(emptyEstimate);
	const [displayedBpm, setDisplayedBpm] = useState<number | null>(null);
	const [breathPulse, setBreathPulse] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [ready, setReady] = useState(false);
	const [debug, setDebug] = useState(false);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setError(null);
		setReady(false);
		setEstimate(emptyEstimate);
		setDisplayedBpm(null);
		displayedBpmRef.current = null;
		estimator.reset();
		globalLumaARef.current = new Uint8Array(GLOBAL_W * GLOBAL_H);
		globalLumaBRef.current = new Uint8Array(GLOBAL_W * GLOBAL_H);
		frameCountRef.current = 0;
		lastBreathCountRef.current = 0;

		(async () => {
			try {
				const stream = await navigator.mediaDevices.getUserMedia({
					video: {
						facingMode: { ideal: "environment" },
						width: { ideal: 640 },
						height: { ideal: 480 },
						frameRate: { ideal: 30 },
					},
					audio: false,
				});
				if (cancelled) {
					for (const t of stream.getTracks()) t.stop();
					return;
				}
				streamRef.current = stream;
				const video = videoRef.current;
				if (!video) return;
				video.srcObject = stream;
				await video.play();
				setReady(true);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Could not access camera",
				);
			}
		})();

		return () => {
			cancelled = true;
			if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
			const stream = streamRef.current;
			if (stream) {
				for (const t of stream.getTracks()) t.stop();
				streamRef.current = null;
			}
			if (videoRef.current) videoRef.current.srcObject = null;
		};
	}, [open, estimator]);

	useEffect(() => {
		if (!open || !ready) return;
		const video = videoRef.current;
		const canvas = captureCanvasRef.current;
		const globalCanvas = globalCanvasRef.current;
		if (!video || !canvas || !globalCanvas) return;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		const gctx = globalCanvas.getContext("2d", { willReadFrequently: true });
		if (!ctx || !gctx) return;
		canvas.width = ROI_W;
		canvas.height = ROI_H;
		globalCanvas.width = GLOBAL_W;
		globalCanvas.height = GLOBAL_H;

		const frameIntervalMs = 1000 / SAMPLE_RATE_HZ;
		let active = true;

		const tick = () => {
			if (!active) return;
			rafRef.current = requestAnimationFrame(tick);

			const now = performance.now();
			if (now - lastSampleAtRef.current < frameIntervalMs - 2) return;
			lastSampleAtRef.current = now;

			const vw = video.videoWidth;
			const vh = video.videoHeight;
			if (!vw || !vh) return;

			const sx = roi.x * vw;
			const sy = roi.y * vh;
			const sw = roi.w * vw;
			const sh = roi.h * vh;
			ctx.drawImage(video, sx, sy, sw, sh, 0, 0, ROI_W, ROI_H);
			gctx.drawImage(video, 0, 0, vw, vh, 0, 0, GLOBAL_W, GLOBAL_H);
			const roiRgba = ctx.getImageData(0, 0, ROI_W, ROI_H).data;
			const globalRgba = gctx.getImageData(0, 0, GLOBAL_W, GLOBAL_H).data;

			const frame = frameCountRef.current;
			const gCurr =
				frame % 2 === 0 ? globalLumaARef.current : globalLumaBRef.current;
			const gPrev =
				frame % 2 === 0 ? globalLumaBRef.current : globalLumaARef.current;
			if (!gCurr) return;

			let meanLuma = 0;
			const Ng = GLOBAL_W * GLOBAL_H;
			for (let i = 0, j = 0; j < Ng; i += 4, j++) {
				const v =
					(globalRgba[i] * 76 +
						globalRgba[i + 1] * 150 +
						globalRgba[i + 2] * 29) >>
					8;
				gCurr[j] = v;
				meanLuma += v;
			}
			meanLuma /= Ng;

			let globalDiff = 0;
			if (frame > 0 && gPrev) {
				let sum = 0;
				for (let i = 0; i < Ng; i++) sum += Math.abs(gCurr[i] - gPrev[i]);
				globalDiff = sum / Ng;
			}

			estimator.feed({
				roiRgba,
				roiWidth: ROI_W,
				roiHeight: ROI_H,
				globalDiff,
				globalMeanLuma: meanLuma,
			});
			frameCountRef.current = frame + 1;
		};
		rafRef.current = requestAnimationFrame(tick);

		const uiInterval = window.setInterval(() => {
			const est = estimator.estimate();
			setEstimate(est);
			drawWaveform(waveformCanvasRef.current, estimator.getWaveform(), est);
			drawRowProfile(profileCanvasRef.current, estimator.getRowProfile());
			if (debug) {
				drawCorners(cornersLayerRef.current, estimator.getDebugCorners(), roi);
			}

			// Smooth the displayed BPM toward the tracker estimate so the
			// number doesn't jump on every UI tick.
			if (est.bpm != null) {
				const prev = displayedBpmRef.current;
				const target = est.bpm;
				const next =
					prev == null
						? target
						: prev + DISPLAY_BPM_SMOOTHING * (target - prev);
				displayedBpmRef.current = next;
				setDisplayedBpm(next);
			} else {
				displayedBpmRef.current = null;
				setDisplayedBpm(null);
			}

			// Pulse on new breath onsets (visible cue that the algorithm sees
			// the same breaths you see).
			if (est.cycleCount > lastBreathCountRef.current) {
				lastBreathCountRef.current = est.cycleCount;
				setBreathPulse((p) => p + 1);
			} else if (est.cycleCount < lastBreathCountRef.current) {
				// Buffer rolled over — resync.
				lastBreathCountRef.current = est.cycleCount;
			}
		}, 250);

		return () => {
			active = false;
			if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
			window.clearInterval(uiInterval);
		};
	}, [open, ready, roi, estimator, debug]);

	if (!open) return null;

	const status = describeStatus(estimate, ready, error);

	return (
		<div
			className="fixed inset-0 z-50 bg-black flex flex-col"
			role="dialog"
			aria-modal="true"
			aria-label="Breathing rate counter"
		>
			<div className="absolute top-3 right-3 z-20 flex gap-2">
				<Button
					size="icon"
					variant="secondary"
					className="rounded-full bg-black/60 text-white hover:bg-black/80 border-0"
					onClick={() => setDebug((d) => !d)}
					aria-label="Toggle debug overlay"
					title="Toggle debug overlay"
				>
					<Sparkles className="w-4 h-4" />
				</Button>
				<Button
					size="icon"
					variant="secondary"
					className="rounded-full bg-black/60 text-white hover:bg-black/80 border-0"
					onClick={onClose}
					aria-label="Close"
				>
					<X className="w-4 h-4" />
				</Button>
			</div>

			<div className="relative flex-1 overflow-hidden">
				<video
					ref={videoRef}
					playsInline
					muted
					className="absolute inset-0 w-full h-full object-cover"
				/>
				<canvas ref={captureCanvasRef} className="hidden" />
				<canvas ref={globalCanvasRef} className="hidden" />
				{ready ? (
					<>
						<RoiOverlay value={roi} onChange={setRoi} />
						{debug ? (
							<canvas
								ref={cornersLayerRef}
								className="absolute inset-0 w-full h-full pointer-events-none"
							/>
						) : null}
						<BreathPulse trigger={breathPulse} />
					</>
				) : error ? (
					<CameraError
						message={error}
						onRetry={() => {
							setError(null);
							setReady(false);
							onClose();
						}}
					/>
				) : (
					<div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm">
						Requesting camera…
					</div>
				)}
			</div>

			<div className="bg-background border-t p-4 sm:p-5 space-y-3">
				<div className="flex items-end justify-between gap-4">
					<div>
						<div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1">
							Respiratory rate
						</div>
						<div className="flex items-baseline gap-2">
							<BpmDisplay estimate={estimate} displayedBpm={displayedBpm} />
							<div className="text-sm text-muted-foreground">BPM</div>
							{estimate.bpmSd != null && estimate.cycleCount >= 3 ? (
								<div className="text-xs text-muted-foreground tabular-nums">
									± {estimate.bpmSd.toFixed(1)}
								</div>
							) : null}
						</div>
						<div
							className={cn(
								"mt-1.5 text-xs flex items-center gap-1.5",
								status.tone === "warn"
									? "text-amber-600"
									: status.tone === "error"
										? "text-destructive"
										: "text-muted-foreground",
							)}
						>
							{status.tone !== "ok" ? (
								<AlertCircle className="w-3 h-3" />
							) : (
								<Activity className="w-3 h-3" />
							)}
							{status.message}
						</div>
					</div>
					<div className="flex flex-col items-end gap-2">
						<QualityChip estimate={estimate} />
						<canvas
							ref={waveformCanvasRef}
							width={240}
							height={56}
							className="rounded-md bg-muted shrink-0"
							style={{ width: 240, height: 56 }}
						/>
					</div>
				</div>
				{debug ? (
					<DebugPanel estimate={estimate} profileCanvasRef={profileCanvasRef} />
				) : (
					<div className="text-[11px] text-muted-foreground leading-snug">
						Point at Beto's chest or flank, or across the back–background line.
						The dot pulses with each detected breath — once a pattern holds for
						a few seconds the reading locks and resists camera wobble.
					</div>
				)}
			</div>
		</div>
	);
}

function BpmDisplay({
	estimate,
	displayedBpm,
}: {
	estimate: BreathingEstimate;
	displayedBpm: number | null;
}) {
	if (estimate.displayState === "uninitialized" || displayedBpm == null) {
		return (
			<div className="font-display text-5xl font-semibold leading-none tabular-nums text-muted-foreground/50">
				—
			</div>
		);
	}
	return (
		<div
			className={cn(
				"font-display text-5xl font-semibold leading-none tabular-nums transition-colors duration-700",
				estimate.isLocked
					? "text-emerald-600"
					: estimate.displayState === "tracking"
						? "text-foreground"
						: "text-muted-foreground",
			)}
		>
			{Math.round(displayedBpm)}
		</div>
	);
}

function describeStatus(
	est: BreathingEstimate,
	ready: boolean,
	error: string | null,
): { message: string; tone: "ok" | "warn" | "error" } {
	if (error) return { message: error, tone: "error" };
	if (!ready) return { message: "Starting camera…", tone: "warn" };
	if (est.shakeRecent) {
		return { message: "Camera shake — hold steadier", tone: "warn" };
	}
	if (est.exposureJumpRecent) {
		return { message: "Camera refocusing — pausing…", tone: "warn" };
	}
	if (est.displayState === "uninitialized") {
		return {
			message: `Searching… (${est.bufferSeconds.toFixed(1)}s)`,
			tone: "warn",
		};
	}
	if (est.displayState === "searching") {
		return {
			message: `Sampling… (${est.bufferSeconds.toFixed(1)}s)`,
			tone: "warn",
		};
	}
	if (est.displayState === "tracking") {
		return {
			message: `Tracking · σ ${Math.sqrt(est.trackerVariance).toFixed(1)} BPM`,
			tone: "warn",
		};
	}
	// Locked.
	const reg =
		est.regularityCV != null && est.cycleCount >= 3
			? est.regularityCV < 0.15
				? "steady"
				: est.regularityCV < 0.3
					? "slightly irregular"
					: "irregular"
			: null;
	return {
		message: reg
			? `Locked · ${reg} · range ${BPM_MIN}–${BPM_MAX} BPM`
			: `Locked · range ${BPM_MIN}–${BPM_MAX} BPM`,
		tone: "ok",
	};
}

function QualityChip({ estimate }: { estimate: BreathingEstimate }) {
	const { quality, displayState, cycleCount, isLocked } = estimate;
	const tone = isLocked
		? "lock"
		: quality.total >= 60
			? "ok"
			: quality.total >= 35
				? "warn"
				: "low";
	const label =
		displayState === "uninitialized"
			? "warming up"
			: displayState === "searching"
				? "searching"
				: `${cycleCount} breaths`;
	const Icon = isLocked ? Lock : Wind;
	return (
		<div
			className={cn(
				"text-[10px] uppercase tracking-[0.14em] font-semibold rounded-full px-2.5 py-1 flex items-center gap-1.5 border",
				tone === "lock"
					? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
					: tone === "ok"
						? "bg-emerald-500/10 text-emerald-700 border-transparent"
						: tone === "warn"
							? "bg-amber-500/15 text-amber-700 border-transparent"
							: "bg-muted text-muted-foreground border-transparent",
			)}
		>
			<Icon className="w-3 h-3" />
			{quality.total}% · {label}
		</div>
	);
}

function DebugPanel({
	estimate,
	profileCanvasRef,
}: {
	estimate: BreathingEstimate;
	profileCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
	const b = estimate.quality.breakdown;
	return (
		<div className="space-y-2">
			<canvas
				ref={profileCanvasRef}
				width={ROI_H * 3}
				height={36}
				className="rounded-md bg-muted/50 w-full"
				style={{ height: 36 }}
			/>
			<div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] font-mono leading-relaxed">
				<DebugRow label="spectral" value={b.spectral} />
				<DebugRow label="peak sharpness" value={b.peakSharpness} />
				<DebugRow label="regularity" value={b.regularity} />
				<DebugRow label="feature health" value={b.featureHealth} />
				<DebugRow label="shake penalty" value={b.shakePenalty} />
				<DebugRow label="exposure penalty" value={b.exposurePenalty} />
				<DebugRow label="display state" value={estimate.displayState} span />
				<DebugRow label="lock age" value={estimate.lockAge} />
				<DebugRow
					label="tracker σ (BPM)"
					value={Math.sqrt(estimate.trackerVariance).toFixed(2)}
				/>
				<DebugRow label="cycles" value={estimate.cycleCount} />
				<DebugRow
					label="regularity CV"
					value={estimate.regularityCV?.toFixed(3) ?? "—"}
				/>
				<DebugRow label="valid samples" value={estimate.aliveFeatures} />
			</div>
		</div>
	);
}

function DebugRow({
	label,
	value,
	span,
}: {
	label: string;
	value: number | string;
	span?: boolean;
}) {
	return (
		<div className={cn("flex justify-between", span ? "col-span-2" : "")}>
			<span className="text-muted-foreground">{label}</span>
			<span>{value}</span>
		</div>
	);
}

function BreathPulse({ trigger }: { trigger: number }) {
	const [show, setShow] = useState(false);
	useEffect(() => {
		if (trigger === 0) return;
		setShow(true);
		const t = window.setTimeout(() => setShow(false), 600);
		return () => window.clearTimeout(t);
	}, [trigger]);
	return (
		<div
			aria-hidden
			className={cn(
				"absolute left-1/2 -translate-x-1/2 top-6 pointer-events-none transition-all duration-500",
				show ? "scale-100 opacity-90" : "scale-50 opacity-0",
			)}
		>
			<div className="rounded-full bg-emerald-400/80 backdrop-blur-md w-4 h-4 shadow-[0_0_20px_rgba(52,211,153,0.8)]" />
		</div>
	);
}

function drawWaveform(
	canvas: HTMLCanvasElement | null,
	samples: Float32Array,
	estimate: BreathingEstimate,
) {
	if (!canvas) return;
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	const W = canvas.width;
	const H = canvas.height;
	ctx.clearRect(0, 0, W, H);
	if (samples.length < 2) return;
	const startIdx = Math.max(0, samples.length - WAVEFORM_SAMPLES);
	const slice = samples.subarray(startIdx);
	let min = Infinity;
	let max = -Infinity;
	for (const s of slice) {
		if (s < min) min = s;
		if (s > max) max = s;
	}
	const range = max - min || 1;
	ctx.strokeStyle = estimate.isLocked ? "rgb(16 185 129)" : "rgb(100 116 139)";
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	for (let i = 0; i < slice.length; i++) {
		const x = (i / (slice.length - 1)) * W;
		const y = H - ((slice[i] - min) / range) * (H - 4) - 2;
		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	}
	ctx.stroke();

	if (estimate.breathOffsets.length > 0) {
		ctx.fillStyle = "rgb(16 185 129)";
		for (const idx of estimate.breathOffsets) {
			const rel = idx - startIdx;
			if (rel < 0 || rel >= slice.length) continue;
			const x = (rel / (slice.length - 1)) * W;
			const y = H - ((slice[rel] - min) / range) * (H - 4) - 2;
			ctx.beginPath();
			ctx.arc(x, y, 2.5, 0, Math.PI * 2);
			ctx.fill();
		}
	}
}

function drawCorners(
	canvas: HTMLCanvasElement | null,
	corners: Array<{ xFrac: number; yFrac: number }>,
	roi: RoiFrac,
) {
	if (!canvas) return;
	const parent = canvas.parentElement;
	if (!parent) return;
	const W = parent.clientWidth;
	const H = parent.clientHeight;
	if (canvas.width !== W || canvas.height !== H) {
		canvas.width = W;
		canvas.height = H;
	}
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	ctx.clearRect(0, 0, W, H);
	const left = roi.x * W;
	const top = roi.y * H;
	const width = roi.w * W;
	const height = roi.h * H;
	ctx.fillStyle = "rgba(52, 211, 153, 0.85)";
	ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
	for (const c of corners) {
		const sx = left + c.xFrac * width;
		const sy = top + c.yFrac * height;
		ctx.beginPath();
		ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
	}
}

function drawRowProfile(
	canvas: HTMLCanvasElement | null,
	profile: Float32Array,
) {
	if (!canvas) return;
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	const W = canvas.width;
	const H = canvas.height;
	ctx.clearRect(0, 0, W, H);
	if (profile.length < 2) return;
	let min = Infinity;
	let max = -Infinity;
	for (const v of profile) {
		if (v < min) min = v;
		if (v > max) max = v;
	}
	const range = max - min || 1;
	ctx.strokeStyle = "rgb(52 211 153)";
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	for (let i = 0; i < profile.length; i++) {
		const x = (i / (profile.length - 1)) * W;
		const y = H - ((profile[i] - min) / range) * (H - 4) - 2;
		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	}
	ctx.stroke();
}

function RoiOverlay({
	value,
	onChange,
}: {
	value: RoiFrac;
	onChange: (next: RoiFrac) => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<{
		startX: number;
		startY: number;
		rect: DOMRect;
		mode: "move" | "resize";
		init: RoiFrac;
	} | null>(null);

	const onPointerDown = (
		e: React.PointerEvent<HTMLDivElement>,
		mode: "move" | "resize",
	) => {
		const container = containerRef.current;
		if (!container) return;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		dragRef.current = {
			startX: e.clientX,
			startY: e.clientY,
			rect: container.getBoundingClientRect(),
			mode,
			init: value,
		};
		e.stopPropagation();
	};

	const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		if (!drag) return;
		const dx = (e.clientX - drag.startX) / drag.rect.width;
		const dy = (e.clientY - drag.startY) / drag.rect.height;
		if (drag.mode === "move") {
			onChange({
				...drag.init,
				x: clamp(drag.init.x + dx, 0, 1 - drag.init.w),
				y: clamp(drag.init.y + dy, 0, 1 - drag.init.h),
			});
		} else {
			onChange({
				...drag.init,
				w: clamp(drag.init.w + dx, 0.1, 1 - drag.init.x),
				h: clamp(drag.init.h + dy, 0.1, 1 - drag.init.y),
			});
		}
	};

	const onPointerUp = () => {
		dragRef.current = null;
	};

	return (
		<div ref={containerRef} className="absolute inset-0 pointer-events-none">
			<div
				className="absolute border-2 border-white/80 shadow-[0_0_0_2px_rgba(0,0,0,0.25)] pointer-events-auto cursor-move touch-none"
				style={{
					left: `${value.x * 100}%`,
					top: `${value.y * 100}%`,
					width: `${value.w * 100}%`,
					height: `${value.h * 100}%`,
				}}
				onPointerDown={(e) => onPointerDown(e, "move")}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
			>
				<div
					className="absolute -right-2 -bottom-2 w-5 h-5 rounded-full bg-white border-2 border-black/30 cursor-nwse-resize touch-none"
					onPointerDown={(e) => onPointerDown(e, "resize")}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
				/>
			</div>
		</div>
	);
}

function CameraError({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	return (
		<div className="absolute inset-0 flex items-center justify-center p-6">
			<div className="bg-background rounded-xl border p-5 max-w-sm space-y-3">
				<div className="flex items-center gap-2 text-destructive">
					<AlertCircle className="w-4 h-4" />
					<div className="font-semibold text-sm">Camera unavailable</div>
				</div>
				<div className="text-xs text-muted-foreground">{message}</div>
				<Button size="sm" onClick={onRetry}>
					Close
				</Button>
			</div>
		</div>
	);
}

function clamp(v: number, lo: number, hi: number) {
	return Math.max(lo, Math.min(hi, v));
}
