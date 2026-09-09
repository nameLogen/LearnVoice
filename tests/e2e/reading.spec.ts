import { test, expect } from "@playwright/test";
test("article import, safe text rendering, word modal and backup round trip", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "故事", exact: true }).click();
  await page.getByLabel("添加文章").click();
  await page.getByLabel("文章标题", { exact: true }).fill("My New Story");
  await page
    .getByLabel("英语文章", { exact: true })
    .fill(
      "An elephant sees a cat. The cat can read.\n\nDon’t go, little elephant! <img src=x onerror=alert(1)>",
    );
  await page.getByRole("button", { name: "保存文章", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My New Story" }),
  ).toBeVisible();
  expect(await page.locator(".reading-paper img").count()).toBe(0);
  await page.getByLabel("查看单词 elephant", { exact: true }).first().click();
  await expect(page.getByRole("dialog", { name: "单词学习" })).toContainText(
    "名词",
  );
  await expect(page.getByRole("dialog")).toContainText("象");
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.reload();
  await page.getByRole("button", { name: "故事", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My New Story" }),
  ).toBeVisible();
  await page.screenshot({
    path: `artifacts/story-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel("打开设置").click();
  await page.getByRole("button", { name: "数据", exact: true }).click();
  const nextDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出文章备份" }).click();
  const download = await nextDownload;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  expect(bytes.toString()).toContain("My New Story");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: bytes,
    });
  await expect(page.getByRole("status")).toContainText("已导入");
});
test("TXT import and paragraph practice preserve completion and reject invalid article", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "故事", exact: true }).click();
  await page.getByLabel("添加文章").click();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "Little.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("\uFEFFThe cat is here.\nA bird can sing."),
    });
  await expect(page.getByLabel("文章标题", { exact: true })).toHaveValue(
    "Little",
  );
  await page.getByRole("button", { name: "保存文章", exact: true }).click();
  await page.getByRole("button", { name: "跟读第 2 段" }).click();
  await expect(page.getByRole("dialog")).toContainText("A bird can sing.");
  await expect(
    page.getByRole("button", { name: "这一句练好了，继续 →" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByLabel("添加文章").click();
  await page.getByLabel("文章标题", { exact: true }).fill("Too long");
  await page.getByLabel("英语文章", { exact: true }).fill("a".repeat(30001));
  await page.getByRole("button", { name: "保存文章", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "30,000",
  );
});
