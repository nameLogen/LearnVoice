import { test, expect, type Page } from '@playwright/test';

// Contract simulation only: headless Chromium has no installed OS speech engine.
// Actual dictionary, audio capture/worklet, persistence and model are not replaced.
async function speechFixture(page: Page, local = true) {
  await page.addInitScript(({local}) => {
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable:true, value: class {
      text: string; constructor(text:string) { this.text = text; }
    } });
    const state = { spoken: [] as {text:string;voice:string}[], stopped: 0, duration: 80 };
    const remote = { voiceURI: 'remote-en', name: 'Online English', lang: 'en-US', localService: false };
    const english = { voiceURI: 'local-en', name: 'Offline English', lang: 'en-US', localService: true };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const synth = new EventTarget() as EventTarget & Record<string, unknown>;
    synth.getVoices = () => local ? [remote, english] : [remote];
    synth.cancel = () => { clearTimeout(timer); state.stopped++; };
    synth.speak = (u: SpeechSynthesisUtterance) => {
      state.spoken.push({text:u.text,voice:u.voice!.voiceURI});
      timer = setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), state.duration);
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable:true, value:synth });
    Object.assign(window, { __speech: state });
  }, {local});
}
async function openReader(page: Page) {
  await page.goto('/'); await page.getByRole('button', {name:'故事阅读',exact:true}).click();
}

test('new article persists, local-only playback follows paragraphs and stops on navigation', async ({page}) => {
  await speechFixture(page); await openReader(page);
  await expect(page.getByRole('combobox',{name:'离线英语声音'})).toHaveValue('local-en');
  await expect(page.getByRole('combobox',{name:'离线英语声音'}).locator('option')).toHaveCount(1);
  await page.getByRole('button',{name:'添加文章',exact:true}).click();
  await page.getByLabel('文章标题',{exact:true}).fill('A New Story');
  await page.getByLabel('英语文章',{exact:true}).fill('An elephant sees a cat. The cat can read.\n\nDon’t go, little elephant!');
  await page.getByRole('button',{name:'保存到我的文章'}).click();
  await page.getByRole('button',{name:'全文播放',exact:true}).click();
  await expect.poll(() => page.evaluate(() => (window as any).__speech.spoken.length)).toBe(3);
  expect(await page.evaluate(() => (window as any).__speech.spoken.every((s:any) => s.voice === 'local-en'))).toBe(true);
  await page.getByRole('button',{name:'练习单词 elephant',exact:true}).first().click();
  await expect(page.locator('.word-ipa')).toContainText('ɛləfənt');
  await page.screenshot({path:`artifacts/reading-word-${test.info().project.name}.png`,fullPage:true});
  await page.getByRole('button',{name:'听单词发音',exact:true}).click();
  await expect.poll(() => page.evaluate(() => (window as any).__speech.spoken.at(-1).text)).toBe('elephant');
  await page.getByRole('button',{name:'关闭单词卡'}).click();
  await page.evaluate(() => { (window as any).__speech.duration = 5000; });
  await page.getByRole('button',{name:'听第 2 段',exact:true}).click();
  await expect(page.locator('.story-sentence.speaking')).toHaveCount(1);
  await page.getByRole('button',{name:'语音实验',exact:true}).click();
  const length = await page.evaluate(() => (window as any).__speech.spoken.length);
  await page.getByRole('button',{name:'故事阅读',exact:true}).click();
  await expect(page.getByRole('heading',{name:'A New Story',exact:true})).toBeVisible();
  await page.reload(); await page.getByRole('button',{name:'故事阅读',exact:true}).click();
  await expect(page.getByRole('heading',{name:'A New Story',exact:true})).toBeVisible();
  expect(length).toBeGreaterThan(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path:`artifacts/reading-${test.info().project.name}.png`,fullPage:true});
});

test('stopping and backgrounding cancel the article queue without advancing', async ({page}) => {
  await speechFixture(page); await openReader(page);
  await page.evaluate(() => { (window as any).__speech.duration = 1500; });
  await page.getByRole('button',{name:'全文播放',exact:true}).click();
  await expect(page.locator('.story-sentence.speaking')).toHaveCount(1);
  await page.getByRole('button',{name:'停止朗读',exact:true}).click();
  await expect(page.locator('.story-sentence.speaking')).toHaveCount(0);
  await page.waitForTimeout(1700);
  expect(await page.evaluate(() => (window as any).__speech.spoken.length)).toBe(1);
  await page.getByRole('button',{name:'全文播放',exact:true}).click();
  await expect(page.locator('.story-sentence.speaking')).toHaveCount(1);
  await page.evaluate(() => { Object.defineProperty(document,'hidden',{value:true,configurable:true}); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.story-sentence.speaking')).toHaveCount(0);
  await page.waitForTimeout(1700);
  expect(await page.evaluate(() => (window as any).__speech.spoken.length)).toBe(2);
});

test('missing offline voices never use a remote fallback; bundled human audio still works', async ({page}) => {
  await speechFixture(page, false); await openReader(page);
  await expect(page.getByText(/没有可用的离线英语声音/)).toBeVisible();
  await expect(page.getByRole('button',{name:'全文播放',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'练习单词 cat',exact:true}).first().click();
  await page.getByRole('button',{name:'听发音示范',exact:true}).click();
  await expect(page.getByTestId('reference-audio')).toHaveJSProperty('paused',false);
  expect(await page.evaluate(() => (window as any).__speech.spoken.length)).toBe(0);
});

test('TXT, unknown words and backup round-trip keep content as plain text', async ({page}) => {
  await speechFixture(page); await openReader(page);
  await page.locator('input[accept=".txt,text/plain"]').setInputFiles({name:'My story.txt',mimeType:'text/plain',buffer:Buffer.from('A qzxxnewword and <script>alert(1)</script>.\n\nRead it again.')});
  await page.getByRole('button',{name:'保存到我的文章'}).click();
  await expect(page.locator('.story-paper')).toContainText('<script>alert(1)</script>');
  await page.getByRole('button',{name:'练习单词 qzxxnewword',exact:true}).click();
  await expect(page.getByText('词典未收录，暂不自动评分。可以听示范并回放自己的声音。')).toBeVisible();
  await expect(page.getByRole('button',{name:'分析这个单词',exact:true})).toBeDisabled();
  await page.getByText('备份与管理',{exact:true}).click();
  const pending = page.waitForEvent('download'); await page.getByRole('button',{name:'导出文章备份'}).click();
  const stream = await (await pending).createReadStream(); const buffers=[]; for await (const b of stream!) buffers.push(b);
  const backup = Buffer.concat(buffers); expect(JSON.parse(backup.toString()).at(-1).title).toBe('My story');
  await page.locator('input[accept=".json,application/json"]').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:backup});
  await expect(page.getByRole('combobox',{name:'选择文章'}).locator('option')).toHaveCount(4);
});

test('real microphone capture supports sentence completion and word analysis in subdirectory', async ({browserName, playwright}, info) => {
  test.skip(info.project.name !== 'desktop-chromium'); test.setTimeout(150_000);
  const browser = await playwright[browserName].launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  const context = await browser.newContext({permissions:['microphone']}); const page = await context.newPage();
  try {
    await speechFixture(page);
    await page.goto('http://127.0.0.1:4175/temp/LearnVoice/');
    await page.getByRole('button',{name:'故事阅读',exact:true}).click();
    await page.getByRole('button',{name:'跟读第 1 段',exact:true}).click();
    await expect(page.getByRole('button',{name:'这一句练好了，继续 →'})).toBeDisabled();
    await page.getByRole('button',{name:'开始跟读录音',exact:true}).click();
    await expect(page.getByRole('button',{name:'结束跟读录音'})).toBeVisible();
    await expect(page.getByRole('button',{name:'语音实验',exact:true})).toBeDisabled();
    await page.waitForTimeout(650);
    await page.getByRole('button',{name:'结束跟读录音'}).click();
    await expect(page.getByRole('button',{name:'这一句练好了，继续 →'})).toBeEnabled();
    await page.getByRole('button',{name:'这一句练好了，继续 →'}).click();
    await expect(page.getByText('本段第 2 / 3 小句')).toBeVisible();
    await expect(page.getByText(/已练 1 \//)).toBeVisible();
    await page.getByRole('button',{name:'关闭段落跟读'}).click();
    await page.getByRole('button',{name:'练习单词 adventure',exact:true}).first().click();
    await expect(page.locator('.word-ipa')).toContainText('ədvɛntʃəɹ');
    await page.getByRole('button',{name:'开始跟读录音',exact:true}).click();
    await page.waitForTimeout(650);
    await page.getByRole('button',{name:'结束跟读录音'}).click();
    await expect(page.getByRole('button',{name:'分析这个单词',exact:true})).toBeEnabled();
    await page.getByRole('button',{name:'分析这个单词',exact:true}).click();
    await expect(page.getByText('正在本机分析…')).toBeHidden({timeout:120000});
    const observations = await page.evaluate(() => JSON.parse(localStorage.getItem('voice-lab-observations-v1')!));
    expect(observations[0].target.id).toBe('cmu:adventure');
    expect(observations[0].engine).toContain('WASM');
    expect(observations[0].elapsedMs).toBeGreaterThan(0);
    // Synthetic microphone data is not a pronunciation accuracy test.
    await page.reload(); await page.getByRole('button',{name:'故事阅读',exact:true}).click();
    await expect(page.getByText(/已练 1 \//)).toBeVisible();
  } finally { await browser.close(); }
});
