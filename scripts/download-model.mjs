import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

const manifest = JSON.parse(await readFile(new URL('../models/manifest.json', import.meta.url), 'utf8'));
const folder = new URL('../public/models/phoneme/', import.meta.url);
await mkdir(folder, { recursive: true });
async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
for (const file of manifest.files) {
  const destination = new URL(file.local, folder);
  const exists = await stat(destination).catch(() => null);
  if (exists && (file.sha256 ? await digest(destination) === file.sha256 : exists.size > 0)) {
    console.log(`已准备 ${file.local}`);
    continue;
  }
  const url = `https://huggingface.co/${manifest.repository}/resolve/${manifest.revision}/${file.remote}`;
  const temporary = new URL(file.local + '.partial', folder);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`下载 ${file.local}（第 ${attempt} 次）`);
      if (process.platform === 'win32') {
        // PowerShell respects the Windows proxy settings, unlike Node 22 fetch.
        const quote = value => "'" + value.replaceAll("'", "''") + "'";
        await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri ${quote(url)} -OutFile ${quote(fileURLToPath(temporary))} -TimeoutSec 600`],
          { windowsHide: true, timeout: 620_000 });
      } else {
        const response = await fetch(url, { signal: AbortSignal.timeout(600_000) });
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
        await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
      }
      if (file.size && (await stat(temporary)).size !== file.size) throw new Error('文件大小不匹配');
      if (file.sha256 && await digest(temporary) !== file.sha256) throw new Error('SHA-256 校验失败');
      await rename(temporary, destination);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      await rm(temporary, { force: true });
      console.error(String(error));
    }
  }
  if (lastError) throw lastError;
}
await writeFile(new URL('manifest.json', folder), JSON.stringify(manifest, null, 2));
console.log(`模型已就绪。推理只读取本地资源；请勿将模型二进制提交到 Git。`);
