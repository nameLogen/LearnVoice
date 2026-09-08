import { expect, test } from '@playwright/test';

function silentWav() {
  const b = Buffer.alloc(44 + 32000);
  b.write('RIFF'); b.writeUInt32LE(b.length-8,4); b.write('WAVE',8); b.write('fmt ',12);
  b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(16000,24); b.writeUInt32LE(32000,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(32000,40);
  return b;
}
test('target switching, silence rejection, annotation persistence and export', async ({page}) => {
  const external: string[] = [];
  page.on('request',request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4173')) external.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading',{name:/认真听见/})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button',{name:'拼音观察',exact:true}).click();
  await expect(page.getByText('mā',{exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'英语单词',exact:true}).click();
  await page.locator('input[type=file]').setInputFiles({name:'silence.wav',mimeType:'audio/wav',buffer:silentWav()});
  await expect(page.getByText('录好了 · 1.0 秒，可以先回放')).toBeVisible();
  await page.getByRole('button',{name:'开始本地分析'}).click();
  await expect(page.getByRole('heading',{name:'暂时无法判断'})).toBeVisible();
  await page.getByRole('button',{name:'暂不确定',exact:true}).click();
  await page.getByLabel('观察备注（选填）').fill('静音对照，未运行模型。');
  await page.reload();
  await page.getByRole('button',{name:/观察记录/}).click();
  await page.locator('summary').click();
  await expect(page.getByText('备注：静音对照，未运行模型。')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button',{name:'导出 JSON'}).click();
  expect((await download).suggestedFilename()).toMatch(/voice-lab-.*\.json/);
  expect(external).toEqual([]);
});

test('actual offline model inference produces a recorded result without external requests',async({page},testInfo)=>{
  test.skip(testInfo.project.name !== 'desktop-chromium','Only load the large model once in CI.');
  test.setTimeout(120_000);
  const external:string[]=[];
  page.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith('http://127.0.0.1:4173')) external.push(request.url());});
  const buffer=silentWav();
  for(let i=0;i<16000;i++) buffer.writeInt16LE(Math.round(6000*Math.sin(2*Math.PI*220*i/16000)),44+i*2);
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({name:'deployment-tone.wav',mimeType:'audio/wav',buffer});
  await page.getByRole('button',{name:'开始本地分析'}).click();
  await expect(page.getByRole('button',{name:'引擎已就绪'})).toBeVisible({timeout:100_000});
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('voice-lab-observations-v1')!));
  expect(saved[0].engine).toBe('ONNX Runtime Web · WASM');
  expect(saved[0].elapsedMs).toBeGreaterThan(0);
  expect(saved[0].verdict).not.toBe('match');
  expect(external).toEqual([]);
  await testInfo.attach('real-inference.json',{body:JSON.stringify(saved[0],null,2),contentType:'application/json'});
});

test('missing model produces a recoverable error, not a successful score',async({page})=>{
  await page.route('**/models/phoneme/vocab.json',route=>route.fulfill({status:404,body:'not installed'}));
  await page.goto('/');
  await page.getByRole('button',{name:'检查并载入模型'}).click();
  await expect(page.getByRole('alert')).toContainText('本地模型未准备');
  await expect(page.getByRole('button',{name:'检查并载入模型'})).toBeEnabled();
});

test('microphone capture can stop, replay and recover after backgrounding',async({},testInfo)=>{
  test.skip(testInfo.project.name !== 'desktop-chromium','The independent fake microphone browser is tested once.');
  // A fake microphone exercises the real getUserMedia + AudioWorklet path.
  const { chromium } = await import('@playwright/test');
  const captureBrowser=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  try{
    const context=await captureBrowser.newContext({permissions:['microphone']});
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:4173');
    await page.getByRole('button',{name:'开始录音',exact:true}).click();
    await expect(page.getByRole('button',{name:'结束录音'})).toBeVisible();
    await page.waitForTimeout(700);
    await page.getByRole('button',{name:'结束录音'}).click();
    await expect(page.getByRole('button',{name:'回放录音'})).toBeEnabled();
    await page.getByRole('button',{name:'回放录音'}).click();
    await expect(page.locator('audio')).toHaveJSProperty('paused',false);
    await page.getByRole('button',{name:'重新录一遍'}).click();
    await expect(page.getByRole('button',{name:'结束录音'})).toBeVisible();
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
    await expect(page.getByRole('alert')).toContainText('切换到后台已停止录音');
    await expect(page.getByRole('button',{name:'开始录音',exact:true})).toBeEnabled();
  }finally{await captureBrowser.close();}
});
