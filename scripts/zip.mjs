import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execCallback);

await mkdir("dist", { recursive: true });

const projectName = basename(process.cwd());
const zipPath = resolve("dist", "plugin.zip");

if (process.platform === "win32") {
  const escapedZipPath = zipPath.replace(/'/g, "''");
  const command = `Compress-Archive -Path dist\\* -DestinationPath '${escapedZipPath}' -Force`;
  await exec(`powershell -NoProfile -Command "${command}"`);
} else {
  const { default: archiver } = await import("archiver");
  const output = createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.directory("dist/", false);
  archive.finalize();
  await pipeline(archive, output);
}

console.log(`ZIP generado para ${projectName}: ${zipPath}`);
