import { test, expect } from "@playwright/test";
test("dictionary lookup, definitions, word dialog and compact mobile navigation", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "今天想认识哪个词？" }),
  ).toBeVisible();
  await page.getByLabel("搜索英文单词").fill("elephant");
  await page
    .locator(".dictionary-result")
    .filter({ has: page.getByText("elephant", { exact: true }) })
    .click();
  const dialog = page.getByRole("dialog", { name: "单词学习" });
  await expect(dialog).toContainText("象");
  await expect(dialog).toContainText("名词");
  await expect(
    dialog.getByRole("button", { name: "开始跟读录音" }),
  ).toBeVisible();
  await page.screenshot({ path: `artifacts/word-${info.project.name}.png` });
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel("清空搜索").click();
  await expect(page.getByText("最近学过")).toBeVisible();
  await page.getByRole("button", { name: "音标", exact: true }).click();
  await expect(page.getByRole("heading", { name: "音标学习" })).toBeVisible();
  await page.getByRole("button", { name: /^\/æ\/ 短元音/ }).click();
  await expect(page.getByRole("button", { name: "播放音标 æ" })).toBeVisible();
  await expect(page.locator(".word-examples")).toContainText("猫");
  await page.getByRole("button", { name: "自然拼读", exact: true }).click();
  await page.getByLabel("拼读分类").selectOption("辅音字母组合");
  await page.getByRole("button", { name: "sh /ʃ/", exact: true }).click();
  await expect(page.getByRole("button", { name: "听这组例词" })).toBeVisible();
  await expect(page.locator(".word-examples")).toContainText("ship");
  await page.getByRole("button", { name: "拼音 Pinyin" }).click();
  await expect(page.getByRole("heading", { name: "拼音学习" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "英语 English" }).click();
  await page.getByRole("button", { name: "词典", exact: true }).click();
  await page.screenshot({ path: `artifacts/home-${info.project.name}.png` });
});
test("settings persist male voice, reading preferences, and export existing records", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("打开设置").click();
  await page.getByRole("button", { name: /Michael 美式男声/ }).click();
  await page.getByLabel("朗读速度").selectOption("0.8");
  await page.getByRole("button", { name: "阅读", exact: true }).click();
  await page.getByLabel("正文字号").selectOption("26");
  await page.reload();
  await page.getByLabel("打开设置").click();
  await expect(
    page.getByRole("button", { name: /Michael 美式男声/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("朗读速度")).toHaveValue("0.8");
  await page.getByRole("button", { name: "阅读", exact: true }).click();
  await expect(page.getByLabel("正文字号")).toHaveValue("26");
});
test("dictionary failures are recoverable and unknown words stay readable", async ({
  page,
}) => {
  await page.route("**/lexicon/el.json", (r) =>
    r.fulfill({ status: 503, body: "temporarily unavailable" }),
  );
  await page.goto("/");
  await page.getByLabel("搜索英文单词").fill("elephant");
  await expect(page.getByRole("alert")).toContainText("未能加载");
  await page.unroute("**/lexicon/el.json");
  await page.getByLabel("搜索英文单词").fill("elephants");
  await expect(page.locator(".dictionary-result").first()).toBeVisible();
  await page.getByLabel("搜索英文单词").fill("qzxxnewword");
  await page.getByRole("button", { name: "直接听读这个词" }).click();
  await expect(page.getByRole("dialog")).toContainText("暂未收录释义");
  await expect(page.getByRole("dialog")).toContainText("暂不自动评分");
});
