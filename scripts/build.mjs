import { cp, mkdir } from "node:fs/promises";

await mkdir("dist/ui", { recursive: true });
await mkdir("dist/ffmpeg", { recursive: true });

await cp("src/code.js", "dist/code.js");
await cp("src/ui/index.html", "dist/ui/index.html");
await cp("src/ui/styles.css", "dist/ui/styles.css");
await cp("src/ui/app.js", "dist/ui/app.js");
await cp("src/recorder/recorder.js", "dist/recorder.js");
await cp("src/ffmpeg/ffmpeg.js", "dist/ffmpeg/ffmpeg.js");

// Reescribe el import para que el runtime cargue desde dist.
const fs = await import("node:fs/promises");
const appJs = await fs.readFile("dist/ui/app.js", "utf8");
await fs.writeFile(
  "dist/ui/app.js",
  appJs
    .replace("../recorder/recorder.js", "../recorder.js")
    .replace("../ffmpeg/ffmpeg.js", "../ffmpeg/ffmpeg.js"),
  "utf8"
);

// Incrusta CSS y JS en index.html para evitar rutas relativas rotas en Figma.
const htmlTemplate = await fs.readFile("src/ui/index.html", "utf8");
const styles = await fs.readFile("src/ui/styles.css", "utf8");
const recorderModule = await fs.readFile("src/recorder/recorder.js", "utf8");
const ffmpegModule = await fs.readFile("src/ffmpeg/ffmpeg.js", "utf8");
const appModule = await fs.readFile("src/ui/app.js", "utf8");

const recorderInline = recorderModule.replace("export class PrototypeRecorder", "class PrototypeRecorder");
const ffmpegInline = ffmpegModule.replace(
  "export async function transcodeWebmToMp4",
  "async function transcodeWebmToMp4"
);
const appInline = appModule.replace(/^import\s+.*;\r?\n/gm, "");

const inlinedHtml = htmlTemplate
  .replace('<link rel="stylesheet" href="./styles.css" />', `<style>\n${styles}\n</style>`)
  .replace(
    '<script type="module" src="./app.js"></script>',
    `<script>\n${recorderInline}\n\n${ffmpegInline}\n\n${appInline}\n</script>`
  );

await fs.writeFile("dist/ui/index.html", inlinedHtml, "utf8");
