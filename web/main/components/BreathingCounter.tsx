import {
	Activity,
	AlertCircle,
	Lock,
	Minus,
	Plus,
	Sparkles,
	Wind,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import {
	type BreathingEstimate,
	createBreathingEstimator,
	type SubRegionDebug,
} from "../lib/breathing.ts";

const ROI_W = 240;
const ROI_H = 180;
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
	const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
	const profileCanvasRef = useRef<HTMLCanvasElement>(null);
	const subRegionLayerRef = useRef<HTMLCanvasElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const rafRef = useRef<number | null>(null);
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
	const [zoom, setZoom] = useState<{
		current: number;
		min: number;
		max: number;
		step: number;
	} | null>(null);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setError(null);
		setReady(false);
		setEstimate(emptyEstimate);
		setDisplayedBpm(null);
		displayedBpmRef.current = null;
		estimator.reset();
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
				// Some platforms (Safari < 17, desktop webcams) don't expose
				// zoom in MediaTrackCapabilities; we only show the controls
				// when the track actually supports it.
				const [track] = stream.getVideoTracks();
				const caps = (track?.getCapabilities?.() ?? {}) as {
					zoom?: { min: number; max: number; step?: number };
				};
				if (caps.zoom && caps.zoom.max > caps.zoom.min) {
					const settings = (track?.getSettings?.() ?? {}) as {
						zoom?: number;
					};
					setZoom({
						current: settings.zoom ?? caps.zoom.min,
						min: caps.zoom.min,
						max: caps.zoom.max,
						step: caps.zoom.step ?? 0.1,
					});
				} else {
					setZoom(null);
				}
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
		if (!video || !canvas) return;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) return;
		canvas.width = ROI_W;
		canvas.height = ROI_H;

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

			// Only sample what's inside the box. Nothing outside contributes
			// to the algorithm — that's the user's contract for the ROI.
			const sx = roi.x * vw;
			const sy = roi.y * vh;
			const sw = roi.w * vw;
			const sh = roi.h * vh;
			ctx.drawImage(video, sx, sy, sw, sh, 0, 0, ROI_W, ROI_H);
			const roiRgba = ctx.getImageData(0, 0, ROI_W, ROI_H).data;

			estimator.feed({
				roiRgba,
				roiWidth: ROI_W,
				roiHeight: ROI_H,
			});
			frameCountRef.current += 1;
		};
		rafRef.current = requestAnimationFrame(tick);

		const uiInterval = window.setInterval(() => {
			const est = estimator.estimate();
			setEstimate(est);
			drawWaveform(waveformCanvasRef.current, estimator.getWaveform(), est);
			drawRowProfile(profileCanvasRef.current, estimator.getRowProfile());
			if (debug) {
				drawSubRegionGrid(
					subRegionLayerRef.current,
					estimator.getDebugSubRegions(),
					roi,
				);
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

	const applyZoom = (next: number) => {
		const stream = streamRef.current;
		if (!stream || !zoom) return;
		const clamped = Math.max(zoom.min, Math.min(zoom.max, next));
		const [track] = stream.getVideoTracks();
		track
			?.applyConstraints({
				advanced: [{ zoom: clamped } as MediaTrackConstraintSet],
			})
			.catch(() => {
				/* the device may transiently reject; ignore */
			});
		setZoom({ ...zoom, current: clamped });
	};

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

			<PinchableVideoStage
				zoom={zoom}
				onZoomChange={applyZoom}
				className="relative flex-1 overflow-hidden"
			>
				<video
					ref={videoRef}
					playsInline
					muted
					className="absolute inset-0 w-full h-full object-cover"
				/>
				<canvas ref={captureCanvasRef} className="hidden" />
				{ready ? (
					<>
						<RoiOverlay value={roi} onChange={setRoi} />
						{debug ? (
							<canvas
								ref={subRegionLayerRef}
								className="absolute inset-0 w-full h-full pointer-events-none"
							/>
						) : null}
						<BreathPulse trigger={breathPulse} />
						{debug ? (
							<FloatingDebug
								estimate={estimate}
								profileCanvasRef={profileCanvasRef}
							/>
						) : null}
						{zoom ? <ZoomControls zoom={zoom} onApply={applyZoom} /> : null}
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
			</PinchableVideoStage>

			<div className="bg-background border-t p-4 sm:p-5 space-y-3">
				<div className="flex items-end justify-between gap-4">
					<div>
						<div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1">
							Respiratory rate
						</div>
						<div className="flex items-baseline gap-2">
							<BpmDisplay estimate={estimate} displayedBpm={displayedBpm} />
							<div className="text-sm text-muted-foreground">BPM</div>
							<div className="text-xs text-muted-foreground tabular-nums min-w-[3.5rem]">
								{estimate.bpmSd != null && estimate.cycleCount >= 3
									? `± ${estimate.bpmSd.toFixed(1)}`
									: ""}
							</div>
						</div>
						<div
							className={cn(
								"mt-1.5 text-xs flex items-center gap-1.5 min-h-[1.25rem]",
								status.tone === "warn"
									? "text-amber-600"
									: status.tone === "error"
										? "text-destructive"
										: "text-muted-foreground",
							)}
						>
							{status.tone !== "ok" ? (
								<AlertCircle className="w-3 h-3 shrink-0" />
							) : (
								<Activity className="w-3 h-3 shrink-0" />
							)}
							<span className="truncate">{status.message}</span>
						</div>
					</div>
					<QualityChip estimate={estimate} />
				</div>
				<canvas
					ref={waveformCanvasRef}
					className="rounded-md bg-muted w-full"
					style={{ height: 96 }}
				/>
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
	const color = estimate.isLocked
		? estimate.displayState === "holding"
			? "text-amber-600"
			: "text-emerald-600"
		: estimate.displayState === "tracking"
			? "text-foreground"
			: "text-muted-foreground";
	return (
		<div
			className={cn(
				"font-display text-5xl font-semibold leading-none tabular-nums transition-colors duration-700",
				color,
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
	if (est.displayState === "holding") {
		return {
			message: "Locked · holding through motion",
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
		message: reg ? `Locked · ${reg}` : "Locked",
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

// Floating debug card overlaid on the video surface. Keeps the bottom
// panel at its natural height (so the camera stays large) while still
// surfacing the per-sub-region row-profile chart and the quality
// breakdown for users who want to know what the algorithm is seeing.
function FloatingDebug({
	estimate,
	profileCanvasRef,
}: {
	estimate: BreathingEstimate;
	profileCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
	const b = estimate.quality.breakdown;
	return (
		<div className="absolute top-16 left-3 z-10 pointer-events-none w-[min(72vw,260px)] rounded-lg bg-black/70 backdrop-blur-md text-white p-2.5 space-y-1.5 text-[10px] font-mono leading-tight">
			<div className="font-sans text-[10px] text-white/70 leading-snug">
				Grid: green = periodic motion (reposition for more bright cells); red =
				motion outlier; outlined = contributed to median.
			</div>
			<canvas
				ref={profileCanvasRef}
				width={ROI_H * 3}
				height={28}
				className="rounded bg-white/10 w-full"
				style={{ height: 28 }}
			/>
			<div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
				<span className="text-white/60">spectral</span>
				<span className="text-right">{b.spectral}</span>
				<span className="text-white/60">peak</span>
				<span className="text-right">{b.peakSharpness}</span>
				<span className="text-white/60">regularity</span>
				<span className="text-white/90 text-right">{b.regularity}</span>
				<span className="text-white/60">tracker σ</span>
				<span className="text-right">
					{Math.sqrt(estimate.trackerVariance).toFixed(2)} BPM
				</span>
				<span className="text-white/60">cycles</span>
				<span className="text-right">{estimate.cycleCount}</span>
				<span className="text-white/60">state</span>
				<span className="text-right">{estimate.displayState}</span>
			</div>
		</div>
	);
}

// Floating zoom +/− buttons. Only rendered when the underlying
// MediaStreamTrack actually exposes a `zoom` capability.
function ZoomControls({
	zoom,
	onApply,
}: {
	zoom: { current: number; min: number; max: number; step: number };
	onApply: (next: number) => void;
}) {
	const stepBig = Math.max(zoom.step, (zoom.max - zoom.min) / 10);
	return (
		<div className="absolute right-3 bottom-3 z-10 flex flex-col gap-2">
			<Button
				size="icon"
				variant="secondary"
				className="rounded-full bg-black/60 text-white hover:bg-black/80 border-0"
				onClick={() => onApply(zoom.current + stepBig)}
				disabled={zoom.current >= zoom.max}
				aria-label="Zoom in"
			>
				<Plus className="w-4 h-4" />
			</Button>
			<div className="text-[10px] font-mono text-white bg-black/60 rounded-full w-8 h-8 flex items-center justify-center">
				{zoom.current.toFixed(1)}×
			</div>
			<Button
				size="icon"
				variant="secondary"
				className="rounded-full bg-black/60 text-white hover:bg-black/80 border-0"
				onClick={() => onApply(zoom.current - stepBig)}
				disabled={zoom.current <= zoom.min}
				aria-label="Zoom out"
			>
				<Minus className="w-4 h-4" />
			</Button>
		</div>
	);
}

// Wraps the video stage and translates two-finger pinch gestures into
// hardware-zoom track constraints. Single-pointer events fall through
// to the children (so RoiOverlay drag still works).
function PinchableVideoStage({
	zoom,
	onZoomChange,
	children,
	className,
}: {
	zoom: { current: number; min: number; max: number; step: number } | null;
	onZoomChange: (next: number) => void;
	children: React.ReactNode;
	className?: string;
}) {
	const pointersRef = useRef(new Map<number, { x: number; y: number }>());
	const pinchStartRef = useRef<{ dist: number; zoom: number } | null>(null);

	const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!zoom || e.pointerType !== "touch") return;
		pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointersRef.current.size === 2) {
			const [a, b] = Array.from(pointersRef.current.values());
			pinchStartRef.current = {
				dist: Math.hypot(a.x - b.x, a.y - b.y),
				zoom: zoom.current,
			};
		}
	};

	const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!zoom || !pointersRef.current.has(e.pointerId)) return;
		pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
		const start = pinchStartRef.current;
		if (pointersRef.current.size === 2 && start) {
			const [a, b] = Array.from(pointersRef.current.values());
			const dist = Math.hypot(a.x - b.x, a.y - b.y);
			if (dist > 0 && start.dist > 0) {
				const factor = dist / start.dist;
				onZoomChange(start.zoom * factor);
			}
		}
	};

	const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
		pointersRef.current.delete(e.pointerId);
		if (pointersRef.current.size < 2) pinchStartRef.current = null;
	};

	return (
		<div
			className={className}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerEnd}
			onPointerCancel={onPointerEnd}
			onPointerLeave={onPointerEnd}
			style={{ touchAction: zoom ? "none" : undefined }}
		>
			{children}
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
	// Match canvas internal resolution to its rendered size for crisp lines
	// across screen widths. Device pixel ratio scaled to keep math simple.
	const dpr = window.devicePixelRatio || 1;
	const rect = canvas.getBoundingClientRect();
	const cssW = Math.max(1, rect.width);
	const cssH = Math.max(1, rect.height);
	const targetW = Math.round(cssW * dpr);
	const targetH = Math.round(cssH * dpr);
	if (canvas.width !== targetW || canvas.height !== targetH) {
		canvas.width = targetW;
		canvas.height = targetH;
	}
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	const W = cssW;
	const H = cssH;
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

// Render the 3×2 sub-region grid that the algorithm actually uses. Each
// cell is tinted by its recent dy amplitude — bright green = strong
// periodic motion the median can trust, dim = no signal, red = body
// motion outlier. A bright outline marks cells currently contributing
// to the median. The user can see at a glance which parts of the ROI
// are productive and reposition the box to keep more cells "lit up".
function drawSubRegionGrid(
	canvas: HTMLCanvasElement | null,
	regions: SubRegionDebug[],
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
	const roiLeft = roi.x * W;
	const roiTop = roi.y * H;
	const roiWidth = roi.w * W;
	const roiHeight = roi.h * H;

	for (const region of regions) {
		const sx = roiLeft + region.xFrac * roiWidth;
		const sy = roiTop + region.yFrac * roiHeight;
		const sw = region.wFrac * roiWidth;
		const sh = region.hFrac * roiHeight;

		const fill = amplitudeFill(region.amplitude);
		ctx.fillStyle = fill;
		ctx.fillRect(sx, sy, sw, sh);

		ctx.strokeStyle = region.contributed
			? "rgba(255, 255, 255, 0.7)"
			: "rgba(255, 255, 255, 0.18)";
		ctx.lineWidth = region.contributed ? 2 : 1;
		ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);

		// Tiny amplitude readout in the corner of each cell so the user can
		// read absolute values, not just colors.
		if (region.historyFill > 5) {
			ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
			ctx.font = "10px ui-monospace, monospace";
			ctx.textBaseline = "top";
			ctx.fillText(region.amplitude.toFixed(2), sx + 4, sy + 4);
		}
	}
}

function amplitudeFill(amplitude: number): string {
	// > 3 px: body motion / outlier territory — tint red.
	if (amplitude > 3) return "rgba(220, 38, 38, 0.32)";
	// Map [0.05, 0.6] px to emerald opacity 0.05 → 0.45. Below 0.05 is
	// effectively no signal; above 0.6 is strong breathing.
	const lo = 0.05;
	const hi = 0.6;
	const t = Math.max(0, Math.min(1, (amplitude - lo) / (hi - lo)));
	const opacity = 0.05 + t * 0.4;
	return `rgba(52, 211, 153, ${opacity.toFixed(3)})`;
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
			<div className="bg-background rounded-2xl surface p-5 max-w-sm space-y-3">
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
