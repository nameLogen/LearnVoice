import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
const run = promisify(execFile),
  manifest = JSON.parse(
    await readFile(
      new URL("../models/tts-manifest.json", import.meta.url),
      "utf8",
    ),
  );
const root = new URL("../public/models/kokoro/", import.meta.url);
async function hash(path) {
  const h = createHash("sha256");
  for await (const b of createReadStream(path)) h.update(b);
  return h.digest("hex");
}
for (const f of manifest.files) {
  const path = new URL(f.local, root);
  await mkdir(new URL("./", path), { recursive: true });
  if ((await stat(path).catch(() => null)) && (await hash(path)) === f.sha256) {
    console.log(`已准备 ${f.local}`);
    continue;
  }
  const url = `https://huggingface.co/${manifest.repository}/resolve/${manifest.revision}/${f.remote}?download=true`,
    temp = new URL(f.local + ".partial", root);
  let error;
  for (let attempt = 0; attempt < 3; attempt++)
    try {
      console.log(`下载 ${f.local}`);
      if (process.platform === "win32") {
        const q = (s) => "'" + s.replaceAll("'", "''") + "'";
        await run(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `$p=[Net.WebRequest]::DefaultWebProxy.GetProxy([uri]${q(url)});if($p.Host -ne 'huggingface.co'){$env:HTTPS_PROXY=$p.AbsoluteUri};curl.exe --http1.1 -sS -L --fail --retry 2 --max-time 600 ${q(url)} -o ${q(fileURLToPath(temp))};if($LASTEXITCODE -ne 0){throw 'Download failed'}`,
          ],
          { windowsHide: true, timeout: 1850000 },
        );
      } else {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(600000),
        });
        if (!response.ok || !response.body)
          throw new Error(`HTTP ${response.status}`);
        await pipeline(
          Readable.fromWeb(response.body),
          createWriteStream(temp),
        );
      }
      if ((await stat(temp)).size !== f.size || (await hash(temp)) !== f.sha256)
        throw new Error("模型校验失败");
      await rename(temp, path);
      error = null;
      break;
    } catch (e) {
      error = e;
      await rm(temp, { force: true });
    }
  if (error) throw error;
}
await writeFile(
  new URL("manifest.json", root),
  JSON.stringify(manifest, null, 2),
);
console.log("四种离线朗读声音已准备。");
