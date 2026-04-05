import { useEffect, useRef } from "react";
import {
	type EditorProjectData,
	normalizeProjectEditor,
	resolveProjectMedia,
	toFileUrl,
	validateProjectData,
} from "@/components/video-editor/projectPersistence";
import { calculateOutputDimensions, GIF_SIZE_PRESETS, VideoExporter } from "@/lib/exporter";
import { GifExporter } from "@/lib/exporter/gifExporter";
import type { ExportFormat, ExportQuality } from "@/lib/exporter/types";
import type { AspectRatio } from "@/utils/aspectRatioUtils";
import { getAspectRatioValue, getNativeAspectRatioValue } from "@/utils/aspectRatioUtils";

/**
 * Headless CLI export component.
 *
 * Rendered when the app is launched with `--export`. It loads the project file,
 * applies any CLI overrides (format, aspect, quality), runs the appropriate
 * exporter, and sends the resulting binary back to the main process which
 * writes it to disk and exits.
 */
export function CliExport() {
	const didRun = useRef(false);

	useEffect(() => {
		if (didRun.current) return;
		didRun.current = true;

		runExport().catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			console.error("[CliExport] fatal:", message);
			window.electronAPI.reportCliExportError(message);
		});
	}, []);

	// Nothing to render -- this is a hidden window.
	return null;
}

// ── helpers ────────────────────────────────────────────────────────────────────

async function runExport(): Promise<void> {
	console.log("[CliExport] Starting headless export...");

	// 1. Get CLI args from the main process
	const args = await window.electronAPI.getCliExportArgs();
	if (!args) {
		throw new Error("No CLI export args received from main process.");
	}

	console.log("[CliExport] Args:", JSON.stringify(args));

	// 2. Read and validate the project file
	const fileResult = await window.electronAPI.readProjectFileByPath(args.projectPath);
	if (!fileResult.success || !fileResult.project) {
		throw new Error(`Failed to read project file: ${fileResult.error ?? "unknown error"}`);
	}

	const raw = fileResult.project;
	if (!validateProjectData(raw)) {
		throw new Error("Invalid project file: missing required fields (version, media, editor).");
	}

	const project = raw as EditorProjectData;
	const media = resolveProjectMedia(project);
	if (!media) {
		throw new Error("Project file has no video source (missing media / videoPath).");
	}

	const editor = normalizeProjectEditor(project.editor);

	// 3. Apply CLI overrides
	const format: ExportFormat = args.format ?? editor.exportFormat;
	const quality: ExportQuality = args.quality ?? editor.exportQuality;
	const aspectRatio: AspectRatio = args.aspect ?? editor.aspectRatio;

	const videoUrl = toFileUrl(media.screenVideoPath);
	const webcamVideoUrl = media.webcamVideoPath ? toFileUrl(media.webcamVideoPath) : undefined;

	// 4. We need to probe the video to learn its native dimensions. We create
	//    a temporary <video> element for this purpose.
	const { videoWidth, videoHeight } = await probeVideoDimensions(videoUrl);

	const aspectRatioValue =
		aspectRatio === "native"
			? getNativeAspectRatioValue(videoWidth, videoHeight, editor.cropRegion)
			: getAspectRatioValue(aspectRatio);

	// 5. Run the appropriate exporter
	if (format === "gif") {
		const dims = calculateOutputDimensions(
			videoWidth,
			videoHeight,
			editor.gifSizePreset,
			GIF_SIZE_PRESETS,
			aspectRatioValue,
		);

		console.log(`[CliExport] GIF export ${dims.width}x${dims.height}`);

		const exporter = new GifExporter({
			videoUrl,
			webcamVideoUrl,
			width: dims.width,
			height: dims.height,
			frameRate: editor.gifFrameRate,
			loop: editor.gifLoop,
			sizePreset: editor.gifSizePreset,
			wallpaper: editor.wallpaper,
			zoomRegions: editor.zoomRegions,
			trimRegions: editor.trimRegions,
			speedRegions: editor.speedRegions,
			showShadow: editor.shadowIntensity > 0,
			shadowIntensity: editor.shadowIntensity,
			showBlur: editor.showBlur,
			motionBlurAmount: editor.motionBlurAmount,
			borderRadius: editor.borderRadius,
			padding: editor.padding,
			videoPadding: editor.padding,
			cropRegion: editor.cropRegion,
			webcamLayoutPreset: editor.webcamLayoutPreset,
			webcamMaskShape: editor.webcamMaskShape,
			webcamPosition: editor.webcamPosition,
			annotationRegions: editor.annotationRegions,
			onProgress: (p) => console.log(`[CliExport] ${Math.round(p.percentage)}%`),
		});

		const result = await exporter.export();
		if (!result.success || !result.blob) {
			throw new Error(result.error ?? "GIF export failed");
		}

		const arrayBuffer = await result.blob.arrayBuffer();
		await window.electronAPI.reportCliExportComplete(arrayBuffer);
	} else {
		// MP4 export
		const { exportWidth, exportHeight, bitrate } = computeMp4Dimensions(
			videoWidth,
			videoHeight,
			quality,
			aspectRatioValue,
		);

		console.log(`[CliExport] MP4 export ${exportWidth}x${exportHeight} @ ${bitrate} bps`);

		const exporter = new VideoExporter({
			videoUrl,
			webcamVideoUrl,
			width: exportWidth,
			height: exportHeight,
			frameRate: 60,
			bitrate,
			codec: "avc1.640033",
			wallpaper: editor.wallpaper,
			zoomRegions: editor.zoomRegions,
			trimRegions: editor.trimRegions,
			speedRegions: editor.speedRegions,
			showShadow: editor.shadowIntensity > 0,
			shadowIntensity: editor.shadowIntensity,
			showBlur: editor.showBlur,
			motionBlurAmount: editor.motionBlurAmount,
			borderRadius: editor.borderRadius,
			padding: editor.padding,
			cropRegion: editor.cropRegion,
			webcamLayoutPreset: editor.webcamLayoutPreset,
			webcamMaskShape: editor.webcamMaskShape,
			webcamPosition: editor.webcamPosition,
			annotationRegions: editor.annotationRegions,
			onProgress: (p) => console.log(`[CliExport] ${Math.round(p.percentage)}%`),
		});

		const result = await exporter.export();
		if (!result.success || !result.blob) {
			throw new Error(result.error ?? "MP4 export failed");
		}

		const arrayBuffer = await result.blob.arrayBuffer();
		await window.electronAPI.reportCliExportComplete(arrayBuffer);
	}
}

// ── video probe ────────────────────────────────────────────────────────────────

function probeVideoDimensions(
	videoUrl: string,
): Promise<{ videoWidth: number; videoHeight: number }> {
	return new Promise((resolve, reject) => {
		const video = document.createElement("video");
		video.preload = "metadata";
		video.muted = true;

		const cleanup = () => {
			video.removeEventListener("loadedmetadata", onLoaded);
			video.removeEventListener("error", onError);
			video.src = "";
		};

		const onLoaded = () => {
			const w = video.videoWidth || 1920;
			const h = video.videoHeight || 1080;
			cleanup();
			resolve({ videoWidth: w, videoHeight: h });
		};

		const onError = () => {
			cleanup();
			reject(new Error(`Failed to load video metadata from ${videoUrl}`));
		};

		video.addEventListener("loadedmetadata", onLoaded);
		video.addEventListener("error", onError);
		video.src = videoUrl;
	});
}

// ── dimension calculation (mirrors VideoEditor.handleExport logic) ─────────

function computeMp4Dimensions(
	sourceWidth: number,
	sourceHeight: number,
	quality: ExportQuality,
	aspectRatioValue: number,
): { exportWidth: number; exportHeight: number; bitrate: number } {
	let exportWidth: number;
	let exportHeight: number;
	let bitrate: number;

	if (quality === "source") {
		exportWidth = sourceWidth;
		exportHeight = sourceHeight;

		if (aspectRatioValue === 1) {
			const baseDimension = Math.floor(Math.min(sourceWidth, sourceHeight) / 2) * 2;
			exportWidth = baseDimension;
			exportHeight = baseDimension;
		} else if (aspectRatioValue > 1) {
			const baseWidth = Math.floor(sourceWidth / 2) * 2;
			let found = false;
			for (let w = baseWidth; w >= 100 && !found; w -= 2) {
				const h = Math.round(w / aspectRatioValue);
				if (h % 2 === 0 && Math.abs(w / h - aspectRatioValue) < 0.0001) {
					exportWidth = w;
					exportHeight = h;
					found = true;
				}
			}
			if (!found) {
				exportWidth = baseWidth;
				exportHeight = Math.floor(baseWidth / aspectRatioValue / 2) * 2;
			}
		} else {
			const baseHeight = Math.floor(sourceHeight / 2) * 2;
			let found = false;
			for (let h = baseHeight; h >= 100 && !found; h -= 2) {
				const w = Math.round(h * aspectRatioValue);
				if (w % 2 === 0 && Math.abs(w / h - aspectRatioValue) < 0.0001) {
					exportWidth = w;
					exportHeight = h;
					found = true;
				}
			}
			if (!found) {
				exportHeight = baseHeight;
				exportWidth = Math.floor((baseHeight * aspectRatioValue) / 2) * 2;
			}
		}

		const totalPixels = exportWidth * exportHeight;
		bitrate = 30_000_000;
		if (totalPixels > 1920 * 1080 && totalPixels <= 2560 * 1440) {
			bitrate = 50_000_000;
		} else if (totalPixels > 2560 * 1440) {
			bitrate = 80_000_000;
		}
	} else {
		const targetHeight = quality === "medium" ? 720 : 1080;
		exportHeight = Math.floor(targetHeight / 2) * 2;
		exportWidth = Math.floor((exportHeight * aspectRatioValue) / 2) * 2;

		const totalPixels = exportWidth * exportHeight;
		if (totalPixels <= 1280 * 720) {
			bitrate = 10_000_000;
		} else if (totalPixels <= 1920 * 1080) {
			bitrate = 20_000_000;
		} else {
			bitrate = 30_000_000;
		}
	}

	return { exportWidth, exportHeight, bitrate };
}
