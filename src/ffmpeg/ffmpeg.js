const FFMPEG_DIST_URL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
const FFMPEG_ESM_URL = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js";
const FFMPEG_UTIL_URL = "https://unpkg.com/@ffmpeg/util@0.12.2/dist/esm/index.js";

let ffmpeg = null;
let fetchFile = null;

async function ensureFfmpegLoaded() {
  if (ffmpeg && fetchFile) {
    return;
  }

  const ffmpegModule = await import(FFMPEG_ESM_URL);
  const utilModule = await import(FFMPEG_UTIL_URL);

  const instance = new ffmpegModule.FFmpeg();
  await instance.load({
    coreURL: `${FFMPEG_DIST_URL}/ffmpeg-core.js`,
    wasmURL: `${FFMPEG_DIST_URL}/ffmpeg-core.wasm`,
    workerURL: `${FFMPEG_DIST_URL}/ffmpeg-core.worker.js`
  });

  ffmpeg = instance;
  fetchFile = utilModule.fetchFile;
}

export async function transcodeWebmToMp4(webmBlob) {
  await ensureFfmpegLoaded();

  const inputFile = `input-${Date.now()}.webm`;
  const outputFile = `output-${Date.now()}.mp4`;

  await ffmpeg.writeFile(inputFile, await fetchFile(webmBlob));

  try {
    await ffmpeg.exec([
      "-i",
      inputFile,
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputFile
    ]);
  } catch {
    // Fallback en runtimes con soporte parcial de codecs.
    await ffmpeg.exec(["-i", inputFile, outputFile]);
  }

  const mp4Data = await ffmpeg.readFile(outputFile);

  await ffmpeg.deleteFile(inputFile);
  await ffmpeg.deleteFile(outputFile);

  return new Blob([mp4Data.buffer], { type: "video/mp4" });
}
