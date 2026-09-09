import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:4176", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  page.on("console", (m) => {
    if (m.type() === "error") console.log(m.text().slice(0, 500));
  });
  const remote = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4176") &&
      !r.url().startsWith("blob:")
    )
      remote.push(r.url());
  });
  for (const voice of ["af_heart", "am_michael", "bf_emma", "bm_george"]) {
    const result = await page.evaluate(async (voice) => {
      const { synthesize } = await import("/src/synthesis.ts");
      const start = performance.now();
      const blob = await synthesize("The cat is on the map.", voice, 0.9);
      const data = await blob.arrayBuffer();
      const context = new AudioContext();
      const decoded = await context.decodeAudioData(data.slice(0));
      const result = {
        voice,
        seconds: decoded.duration,
        elapsed: performance.now() - start,
        peak: decoded
          .getChannelData(0)
          .reduce((p, x) => Math.max(p, Math.abs(x)), 0),
        wav: Array.from(new Uint8Array(data)),
      };
      await context.close();
      return result;
    }, voice);
    await writeFile(`artifacts/tts-${voice}.wav`, new Uint8Array(result.wav));
    delete result.wav;
    console.log(JSON.stringify(result));
  }
  if (remote.length) throw new Error(JSON.stringify(remote));
} finally {
  await browser.close();
}
