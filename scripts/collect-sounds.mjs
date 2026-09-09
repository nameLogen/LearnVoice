import { sounds } from "../src/learning.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
const run = promisify(execFile),
  quote = (s) => "'" + s.replaceAll("'", "''") + "'";
await mkdir("public/sounds", { recursive: true });
await mkdir("artifacts/sources/ipa", { recursive: true });
async function request(url, dest) {
  await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$p=[Net.WebRequest]::DefaultWebProxy.GetProxy([uri]${quote(url)});if($p.Host -ne ([uri]${quote(url)}).Host){$env:HTTPS_PROXY=$p.AbsoluteUri};curl.exe --http1.1 -sS -L --fail --max-time 15 ${quote(url)} -o ${quote(dest)};if($LASTEXITCODE -ne 0){throw 'Download failed'}`,
    ],
    { windowsHide: true, timeout: 20000 },
  );
}
const catalog = JSON.parse(await readFile('public/sounds/catalog.json','utf8').catch(()=>'{}'));
const missing = [];
for (const sound of sounds) {
  if(process.argv.length>2&&!process.argv.slice(2).includes(sound.id))continue;
  const cache = `artifacts/sources/ipa/${sound.id}.json`;
  try {
    if (!(await stat(cache).catch(() => null)))
      await request(
        `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent("File:" + sound.source)}&prop=imageinfo&iiprop=url%7Cextmetadata&redirects=1&format=json`,
        cache,
      );
    const data = JSON.parse(
      (await readFile(cache, "utf8")).replace(/^\uFEFF/, ""),
    );
    const page = Object.values(data.query.pages)[0],
      info = page.imageinfo?.[0];
    if (!info) {
      missing.push({ id: sound.id, source: sound.source });
      continue;
    }
    const meta = info.extmetadata;
    const license = meta.LicenseShortName?.value ?? "";
    if (!/CC BY|CC0|Public domain/i.test(license)) {
      missing.push({ id: sound.id, license });
      continue;
    }
    const dest = `public/sounds/${sound.id}.ogg`,
      url = info.url.split("?")[0];
    if (!(await stat(dest).catch(() => null))) await request(url+'?download=1', dest);
    catalog[sound.id] = {
      path: `sounds/${sound.id}.ogg`,
      source: info.descriptionurl,
      originalUrl: url,
      author: (meta.Artist?.value ?? "See source").replace(/<[^>]*>/g, ""),
      license,
      licenseUrl: meta.LicenseUrl?.value ?? "",
      description: (meta.ImageDescription?.value ?? "").replace(/<[^>]*>/g, ""),
      changes: "原始录音，未修改。",
      sha256: createHash("sha256")
        .update(await readFile(dest))
        .digest("hex"),
      kind: sound.source.startsWith("En-") ? "word" : "sound",
    };
    console.log(sound.id + " collected");
  } catch (e) {
    missing.push({ id: sound.id, error: String(e).slice(0, 150) });
  }
}
await writeFile("public/sounds/catalog.json", JSON.stringify(catalog, null, 2));
await writeFile(
  "artifacts/sources/ipa/missing.json",
  JSON.stringify(missing, null, 2),
);
console.log(
  JSON.stringify({ collected: Object.keys(catalog).length, missing }),
);
