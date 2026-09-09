import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

// A tone checks file handling/playback only. It is never shipped as a phoneme.
function wav(seconds = 0.5, silent = false) {
  const size = Math.round(16000 * seconds);
  const buffer = Buffer.alloc(44 + size * 2);
  buffer.write("RIFF");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24);
  buffer.writeUInt32LE(32000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(size * 2, 40);
  for (let i = 0; i < size; i++)
    buffer.writeInt16LE(
      silent ? 0 : Math.round(4000 * Math.sin((i * 2 * Math.PI * 440) / 16000)),
      44 + 2 * i,
    );
  return { name: "test-only-not-a-phoneme.wav", mimeType: "audio/wav", buffer };
}

test("missing phonemes never play a whole word or request TTS, and catalog errors can recover", async ({
  page,
}) => {
  const playbackRequests: string[] = [];
  page.on("request", (r) => {
    if (/\/models\/|\.(ogg|wav|mp3)(\?|$)/.test(r.url()))
      playbackRequests.push(r.url());
  });
  await page.route("**/sounds/catalog.v2.json", (r) =>
    r.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "音标", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("清单加载失败");
  await page.getByRole("button", { name: /^\/æ\/ 短元音/ }).click();
  await expect(page.getByLabel("播放音标 æ")).toBeDisabled();
  await expect(page.getByText("示范录音待补充", { exact: true })).toBeVisible();
  await page.unroute("**/sounds/catalog.v2.json");
  await page.getByRole("button", { name: "重新读取录音" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("播放音标 æ")).toBeDisabled();
  expect(playbackRequests).toEqual([]);
});

test("local teaching audio requires preview, persists, plays offline and can be removed", async ({
  page,
  context,
}, info) => {
  await page.addInitScript(() => {
    const OriginalAudio = window.Audio;
    (window as any).__soundAudio = [];
    window.Audio = function () {
      const element = new OriginalAudio();
      (window as any).__soundAudio.push(element);
      return element;
    } as unknown as typeof Audio;
  });
  await page.goto("/");
  await page.getByLabel("打开设置").click();
  await page.getByText("音标教学录音 · 本机已导入", { exact: false }).click();
  await page.getByLabel("导入录音的音标").selectOption("ae");
  await page.getByLabel("录音来源名称").fill("测试文件，非教学素材");
  await page.getByLabel("选择音标录音文件").setInputFiles(wav());
  const adopt = page.getByRole("button", { name: "采用这段示范" });
  await expect(adopt).toBeDisabled();
  const preview = page.getByLabel("试听导入的音标录音");
  await preview.evaluate((audio: HTMLAudioElement) => audio.play());
  await expect(adopt).toBeEnabled();
  await adopt.click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.reload();
  await page.getByRole("button", { name: "音标", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("可听示范 1 / 48");
  await context.setOffline(true);
  await page.getByRole("button", { name: /^\/æ\/ 短元音/ }).click();
  await expect(page.getByLabel("播放音标 æ")).toBeEnabled();
  await expect(
    page.getByText("本机导入 · 英式教学录音", { exact: false }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__soundAudio.some(
          (a: HTMLAudioElement) =>
            a.src.startsWith("blob:") && a.currentTime > 0,
        ),
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/sound-local-${info.project.name}.png`,
  });
  await context.setOffline(false);
  await page.getByLabel("打开设置").click();
  await page.getByText("音标教学录音 · 本机已导入", { exact: false }).click();
  await page.getByLabel("导入录音的音标").selectOption("ae");
  await page.getByRole("button", { name: "移除此项本机录音" }).click();
  await expect(page.getByRole("status")).toContainText("已移除");
  await page.getByLabel("返回学习").click();
  await page.getByRole("button", { name: /^\/æ\/ 短元音/ }).click();
  await expect(page.getByLabel("播放音标 æ")).toBeDisabled();
});

test("invalid, silent and long files do not become phoneme demonstrations", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("打开设置").click();
  await page.getByText("音标教学录音 · 本机已导入", { exact: false }).click();
  const input = page.getByLabel("选择音标录音文件");
  await input.setInputFiles({
    name: "broken.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from("broken"),
  });
  await expect(page.getByRole("alert")).toContainText("无法解码");
  await input.setInputFiles(wav(0.5, true));
  await expect(page.getByRole("alert")).toContainText("几乎没有声音");
  await input.setInputFiles(wav(9));
  await expect(page.getByRole("alert")).toContainText("0.08～8 秒");
  await expect(page.getByRole("button", { name: "采用这段示范" })).toHaveCount(
    0,
  );
});

test("bundled clip failure has no synthesized fallback and retry stays in a subdirectory", async ({
  page,
}) => {
  const fixture = wav();
  const unexpected: string[] = [];
  page.on("request", (r) => {
    if (
      /\/models\//.test(r.url()) ||
      /127\.0\.0\.1:4175\/(sounds|assets)\//.test(r.url())
    )
      unexpected.push(r.url());
  });
  await page.route("**/sounds/catalog.v2.json", (r) =>
    r.fulfill({
      json: {
        schemaVersion: 2,
        entries: {
          ae: {
            path: "sounds/approved/ae.wav",
            kind: "isolated-human",
            accent: "en-GB",
            author: "Test fixture only",
            source: "https://example.com/fixture",
            license: "CC0",
            licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
            sha256: createHash("sha256").update(fixture.buffer).digest("hex"),
            review: {
              status: "accepted",
              reviewer: "Test fixture",
              date: "2026-09-09",
            },
          },
        },
      },
    }),
  );
  await page.route("**/sounds/approved/ae.wav", (r) =>
    r.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto("http://127.0.0.1:4175/temp/LearnVoice/");
  await page.getByRole("button", { name: "音标", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("可听示范 1 / 48");
  await page.getByRole("button", { name: /^\/æ\/ 短元音/ }).click();
  await expect(page.getByRole("alert")).toContainText("音频无法播放");
  await page.unroute("**/sounds/approved/ae.wav");
  await page.route("**/sounds/approved/ae.wav", (r) =>
    r.fulfill({ contentType: "audio/wav", body: fixture.buffer }),
  );
  const response = page.waitForResponse(
    "http://127.0.0.1:4175/temp/LearnVoice/sounds/approved/ae.wav",
  );
  await page.getByLabel("播放音标 æ").click();
  expect((await response).ok()).toBe(true);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(unexpected).toEqual([]);
});
