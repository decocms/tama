import { Activity, AlertCircle, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import {
	BPM_MAX,
	BPM_MIN,
	type BreathingEstimate,
	createBreathingEstimator,
	extractSignals,
	SAMPLE_RATE_HZ,
} from "../lib/breathing.ts";

const ROI_W = 80;
const ROI_H = 60;
const GLOBAL_W = 40;
const GLOBAL_H = 30;
const WAVEFORM_SAMPLES = SAMPLE_RATE_HZ * 12;

type RoiFrac = { x: number; y: number; w: number; h: number };
const DEFAULT_ROI: RoiFrac = { x: 0.35, y: 0.375, w: 0.3, h: 0.25 };

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
	const overlayRef = useRef<HTMLDivElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const rafRef = useRef<number | null>(null);
	const roiLumaARef = useRef<Uint8Array | null>(null);
	const roiLumaBRef = useRef<Uint8Array | null>(null);
	const roiScratchRef = useRef<Uint8Array | null>(null);
	const globalLumaARef = useRef<Uint8Array | null>(null);
	const globalLumaBRef = useRef<Uint8Array | null>(null);
	const frameCountRef = useRef(0);
	const lastSampleAtRef = useRef(0);

	const estimator = useMemo(() => createBreathingEstimator(), []);
	const [roi, setRoi] = useState<RoiFrac>(DEFAULT_ROI);
	const [estimate, setEstimate] = useState<BreathingEstimate>({
		bpm: null,
		confidence: 0,
		samplesReady: 0,
		bufferSeconds: 0,
		shakeRecent: false,
		activeSignal: null,
	});
	const [error, setError] = useState<string | null>(null);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setError(null);
		setReady(false);
		estimator.reset();
		roiLumaARef.current = new Uint8Array(ROI_W * ROI_H);
		roiLumaBRef.current = new Uint8Array(ROI_W * ROI_H);
		roiScratchRef.current = new Uint8Array(ROI_W * ROI_H);
		globalLumaARef.current = new Uint8Array(GLOBAL_W * GLOBAL_H);
		globalLumaBRef.current = new Uint8Array(GLOBAL_W * GLOBAL_H);
		frameCountRef.current = 0;

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
			const roiCurr =
				frame % 2 === 0 ? roiLumaARef.current : roiLumaBRef.current;
			const roiPrev =
				frame % 2 === 0 ? roiLumaBRef.current : roiLumaARef.current;
			const gCurr =
				frame % 2 === 0 ? globalLumaARef.current : globalLumaBRef.current;
			const gPrev =
				frame % 2 === 0 ? globalLumaBRef.current : globalLumaARef.current;
			const scratch = roiScratchRef.current;
			if (!roiCurr || !gCurr || !scratch) return;

			const { edge, diff } = extractSignals(
				roiRgba,
				ROI_W,
				ROI_H,
				roiCurr,
				frame === 0 ? null : roiPrev,
				scratch,
			);
			const globalDiff = extractGlobalDiff(
				globalRgba,
				GLOBAL_W,
				GLOBAL_H,
				gCurr,
				frame === 0 ? null : gPrev,
			);
			estimator.feed({ edge, diff, globalDiff });
			frameCountRef.current = frame + 1;
		};
		rafRef.current = requestAnimationFrame(tick);

		const uiInterval = window.setInterval(() => {
			setEstimate(estimator.estimate());
			drawWaveform(waveformCanvasRef.current, estimator.getWaveform());
		}, 500);

		return () => {
			active = false;
			if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
			window.clearInterval(uiInterval);
		};
	}, [open, ready, roi, estimator]);

	if (!open) return null;

	const status = describeStatus(estimate, ready, error);

	return (
		<div
			ref={overlayRef}
			className="fixed inset-0 z-50 bg-black flex flex-col"
			role="dialog"
			aria-modal="true"
			aria-label="Breathing rate counter"
		>
			<div className="absolute top-3 right-3 z-20">
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
					<RoiOverlay value={roi} onChange={setRoi} />
				) : error ? (
					<CameraError
						message={error}
						onRetry={() => {
							setError(null);
							setReady(false);
							// Re-trigger open effect by closing/reopening; simplest: bounce
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
							<div className="font-display text-5xl font-semibold leading-none tabular-nums">
								{estimate.bpm != null ? Math.round(estimate.bpm) : "—"}
							</div>
							<div className="text-sm text-muted-foreground">BPM</div>
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
					<canvas
						ref={waveformCanvasRef}
						width={240}
						height={72}
						className="rounded-md bg-muted shrink-0"
						style={{ width: 240, height: 72 }}
					/>
				</div>
				<div className="text-[11px] text-muted-foreground leading-snug">
					Point the camera at Beto's chest or flank. Drag the box to fit the
					breathing area. Keep the camera steady; the estimate settles after ~15
					seconds.
				</div>
			</div>
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
		return {
			message: "Camera shake — hold steadier",
			tone: "warn",
		};
	}
	if (est.bpm == null) {
		return {
			message: `Sampling… (${est.bufferSeconds.toFixed(1)}s collected)`,
			tone: "warn",
		};
	}
	if (est.confidence < 0.3) {
		return {
			message: "Low signal — reposition or steady the camera",
			tone: "warn",
		};
	}
	const via = est.activeSignal === "edge" ? "edge" : "motion";
	const range = `Range ${BPM_MIN}–${BPM_MAX} BPM · ${via} signal · ${(est.confidence * 100).toFixed(0)}%`;
	return { message: range, tone: "ok" };
}

function drawWaveform(canvas: HTMLCanvasElement | null, samples: Float32Array) {
	if (!canvas) return;
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	const W = canvas.width;
	const H = canvas.height;
	ctx.clearRect(0, 0, W, H);
	if (samples.length < 2) return;
	const slice =
		samples.length > WAVEFORM_SAMPLES
			? samples.subarray(samples.length - WAVEFORM_SAMPLES)
			: samples;
	let min = Infinity;
	let max = -Infinity;
	for (const s of slice) {
		if (s < min) min = s;
		if (s > max) max = s;
	}
	const range = max - min || 1;
	ctx.strokeStyle = "rgb(100 116 139)";
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	for (let i = 0; i < slice.length; i++) {
		const x = (i / (slice.length - 1)) * W;
		const norm = (slice[i] - min) / range;
		const y = H - norm * (H - 4) - 2;
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

function extractGlobalDiff(
	rgba: Uint8ClampedArray,
	width: number,
	height: number,
	curr: Uint8Array,
	prev: Uint8Array | null,
): number {
	const N = width * height;
	for (let i = 0, j = 0; j < N; i += 4, j++) {
		curr[j] = (rgba[i] * 76 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
	}
	if (!prev) return 0;
	let sum = 0;
	for (let i = 0; i < N; i++) sum += Math.abs(curr[i] - prev[i]);
	return sum / N;
}
