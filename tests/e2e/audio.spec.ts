import { test, expect, chromium } from "@playwright/test";
import references from "../../public/references/catalog.json" with { type: "json" };
import sounds from "../../public/sounds/catalog.json" with { type: "json" };
test("all bundled recordings decode with audible output", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop-chromium",
    "Decode the complete audio library once.",
  );
  await page.goto("/");
  for (const a of [...Object.values(references), ...Object.values(sounds)]) {
    const result = await page.evaluate(async (path) => {
      const ctx = new AudioContext();
      try {
        const r = await fetch(path);
        if (!r.ok) throw new Error(path);
        const b = await ctx.decodeAudioData(await r.arrayBuffer());
        return {
          duration: b.duration,
          peak: b
            .getChannelData(0)
            .reduce((n, x) => Math.max(n, Math.abs(x)), 0),
        };
      } finally {
        await ctx.close();
      }
    }, a.path);
    expect(result.duration, a.path).toBeGreaterThan(0.08);
    expect(result.peak, a.path).toBeGreaterThan(0.005);
  }
});
test("actual offline model automatically scores after microphone recording and persists export", async ({}, info) => {
  test.skip(
    info.project.name !== "desktop-chromium",
    "Load the real model once.",
  );
  test.setTimeout(150000);
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  try {
    const context = await browser.newContext({ permissions: ["microphone"] }),
      page = await context.newPage();
    const external: string[] = [];
    page.on("request", (r) => {
      if (
        /^https?:/.test(r.url()) &&
        !r.url().startsWith("http://127.0.0.1:4173")
      )
        external.push(r.url());
    });
    await page.goto("http://127.0.0.1:4173");
    await page
      .locator(".example-word")
      .filter({ has: page.getByText("cat", { exact: true }) })
      .click();
    await page.getByLabel("播放单词发音").click();
    await page.getByRole("button", { name: "开始跟读录音" }).click();
    await expect(
      page.getByRole("button", { name: "结束跟读录音" }),
    ).toBeVisible();
    await expect(page.getByLabel("关闭弹窗")).toBeDisabled();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "结束跟读录音" }).click();
    await expect(page.getByRole("button", { name: "再读一次" })).toBeEnabled({
      timeout: 110000,
    });
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("voice-lab-observations-v1")!),
    );
    expect(saved).toHaveLength(1);
    expect(saved[0].engine).toBe("ONNX Runtime Web · WASM");
    expect(saved[0].elapsedMs).toBeGreaterThan(0);
    expect(external).toEqual([]);
    await expect(page.locator("audio[controls]")).toBeVisible();
    await page.getByRole("button", { name: "再读一次" }).click();
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        value: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByRole("alert")).toContainText("切到后台已停止");
    await expect(page.getByLabel("关闭弹窗")).toBeEnabled();
    await page.getByLabel("关闭弹窗").click();
    await page.reload();
    await page.getByLabel("打开设置").click();
    await page.getByRole("button", { name: "家长", exact: true }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出练习记录" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.json$/);
    await info.attach("actual-analysis.json", {
      body: JSON.stringify(saved[0], null, 2),
      contentType: "application/json",
    });
  } finally {
    await browser.close();
  }
});
test("missing analysis model gives a recoverable settings error", async ({
  page,
}) => {
  await page.route("**/models/phoneme/vocab.json", (r) =>
    r.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto("/");
  await page.getByLabel("打开设置").click();
  await page.getByRole("button", { name: "家长", exact: true }).click();
  await page.getByRole("button", { name: "检查分析模型" }).click();
  await expect(page.getByRole("alert")).toContainText("本地模型未准备");
  await expect(
    page.getByRole("button", { name: "检查分析模型" }),
  ).toBeEnabled();
});
test("actual offline TTS male/female, exact pause resume and subdirectory deployment", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop-chromium",
    "Generate four real voices once.",
  );
  test.setTimeout(180000);
  const prefix = "http://127.0.0.1:4175/temp/LearnVoice/",
    requests: string[] = [],
    failures: string[] = [];
  await page.addInitScript(() => {
    const AudioOriginal = window.Audio;
    Object.assign(window, { __audio: [] });
    window.Audio = function (src?: string) {
      const a = new AudioOriginal(src);
      (window as any).__audio.push(a);
      return a;
    } as unknown as typeof Audio;
  });
  page.on("request", (r) => {
    if (/^https?:/.test(r.url())) requests.push(r.url());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(prefix + "index.html?test=1#read");
  await expect(
    page.getByRole("heading", { name: "今天想认识哪个词？" }),
  ).toBeVisible();
  await page.getByLabel("打开设置").click();
  for (const voice of ["Heart", "Michael", "Emma", "George"]) {
    await page.getByLabel(`试听 ${voice}`).click();
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            (window as any).__audio.some((a: HTMLAudioElement) => !a.paused),
          ),
        { timeout: 60000 },
      )
      .toBe(true);
    const decoded = await page.evaluate(async () => {
      const a = (window as any).__audio.find(
        (a: HTMLAudioElement) => !a.paused,
      );
      const c = new AudioContext();
      try {
        const b = await c.decodeAudioData(
          await (await fetch(a.src)).arrayBuffer(),
        );
        return {
          duration: b.duration,
          peak: b
            .getChannelData(0)
            .reduce((n, x) => Math.max(n, Math.abs(x)), 0),
        };
      } finally {
        await c.close();
      }
    });
    expect(decoded.duration).toBeGreaterThan(1);
    expect(decoded.peak).toBeGreaterThan(0.02);
  }
  await page.getByLabel("返回学习").click();
  await page.getByRole("button", { name: "故事", exact: true }).click();
  await page.getByLabel("播放朗读").click();
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as any).__audio.some((a: HTMLAudioElement) => !a.paused),
        ),
      { timeout: 60000 },
    )
    .toBe(true);
  await page.waitForTimeout(250);
  await page.getByLabel("暂停朗读").click();
  const position = await page.evaluate(
    () => (window as any).__audio.at(-1).currentTime,
  );
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(() => (window as any).__audio.at(-1).currentTime),
  ).toBe(position);
  await page.getByLabel("播放朗读").click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__audio.at(-1).currentTime))
    .toBeGreaterThan(position);
  await page.getByLabel("查看单词 cat", { exact: true }).first().click();
  expect(
    await page.evaluate(() =>
      (window as any).__audio.every((a: HTMLAudioElement) => a.paused),
    ),
  ).toBe(true);
  await expect(page.getByRole("dialog")).toContainText("猫");
  await page.getByLabel("关闭弹窗").click();
  await page.getByLabel("播放朗读").click();
  await page.getByRole("button", { name: "词典", exact: true }).click();
  expect(
    await page.evaluate(() =>
      (window as any).__audio.every((a: HTMLAudioElement) => a.paused),
    ),
  ).toBe(true);
  expect(requests.every((url) => url.startsWith(prefix))).toBe(true);
  expect(
    requests.some((u) =>
      u.includes("/models/kokoro/onnx/model_quantized.onnx"),
    ),
  ).toBe(true);
  expect(failures).toEqual([]);
  await info.attach("subdirectory-requests.json", {
    body: JSON.stringify(requests, null, 2),
    contentType: "application/json",
  });
});
