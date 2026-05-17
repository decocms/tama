// Client-side audio chunker: decodes an arbitrary audio file via Web Audio API
// and re-encodes it as N chunks of 16 kHz mono 16-bit WAV. Each chunk is well
// under the Whisper 25 MB limit (~25 min of 16 kHz mono 16-bit fits in 25 MB).

export interface AudioChunk {
	idx: number;
	startS: number;
	endS: number;
	base64: string; // raw WAV bytes, base64-encoded
}

export interface ChunkResult {
	durationS: number;
	chunks: AudioChunk[];
}

const TARGET_SAMPLE_RATE = 16000;
const CHUNK_SECONDS = 600; // 10 minutes per chunk

export async function decodeAndChunk(
	file: File,
	options: { chunkSeconds?: number; onProgress?: (msg: string) => void } = {},
): Promise<ChunkResult> {
	const chunkSec = options.chunkSeconds ?? CHUNK_SECONDS;
	options.onProgress?.("decoding…");

	const arrayBuffer = await file.arrayBuffer();
	const decodeCtx = new (
		window.AudioContext ||
		// biome-ignore lint/suspicious/noExplicitAny: legacy webkit prefix
		(window as any).webkitAudioContext
	)();
	const decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
	await decodeCtx.close();

	// Downmix to mono and resample to TARGET_SAMPLE_RATE using OfflineAudioContext.
	const monoLength = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
	const offlineCtx = new OfflineAudioContext(1, monoLength, TARGET_SAMPLE_RATE);
	const src = offlineCtx.createBufferSource();
	src.buffer = decoded;
	src.connect(offlineCtx.destination);
	src.start(0);
	options.onProgress?.("resampling…");
	const rendered = await offlineCtx.startRendering();
	const samples = rendered.getChannelData(0);
	const durationS = rendered.duration;

	const chunks: AudioChunk[] = [];
	const samplesPerChunk = chunkSec * TARGET_SAMPLE_RATE;
	const numChunks = Math.max(1, Math.ceil(samples.length / samplesPerChunk));

	for (let i = 0; i < numChunks; i++) {
		const startSample = i * samplesPerChunk;
		const endSample = Math.min(startSample + samplesPerChunk, samples.length);
		const slice = samples.subarray(startSample, endSample);
		options.onProgress?.(`encoding chunk ${i + 1}/${numChunks}…`);
		const wav = encodeWav(slice, TARGET_SAMPLE_RATE);
		chunks.push({
			idx: i,
			startS: startSample / TARGET_SAMPLE_RATE,
			endS: endSample / TARGET_SAMPLE_RATE,
			base64: bytesToBase64(wav),
		});
	}

	return { durationS, chunks };
}

// Encode a Float32 sample array as PCM16 mono WAV. Header is 44 bytes.
function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
	const numSamples = samples.length;
	const buffer = new ArrayBuffer(44 + numSamples * 2);
	const view = new DataView(buffer);

	writeAscii(view, 0, "RIFF");
	view.setUint32(4, 36 + numSamples * 2, true);
	writeAscii(view, 8, "WAVE");
	writeAscii(view, 12, "fmt ");
	view.setUint32(16, 16, true); // PCM fmt chunk size
	view.setUint16(20, 1, true); // PCM format
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true); // byte rate
	view.setUint16(32, 2, true); // block align
	view.setUint16(34, 16, true); // bits per sample
	writeAscii(view, 36, "data");
	view.setUint32(40, numSamples * 2, true);

	let offset = 44;
	for (let i = 0; i < numSamples; i++) {
		const s = Math.max(-1, Math.min(1, samples[i]));
		view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
		offset += 2;
	}
	return new Uint8Array(buffer);
}

function writeAscii(view: DataView, offset: number, str: string) {
	for (let i = 0; i < str.length; i++) {
		view.setUint8(offset + i, str.charCodeAt(i));
	}
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}

// Helper for the original file (we want to keep the user's original audio
// untouched in R2 alongside the resampled WAV chunks).
export async function fileToBase64(file: File): Promise<string> {
	const buf = new Uint8Array(await file.arrayBuffer());
	return bytesToBase64(buf);
}
