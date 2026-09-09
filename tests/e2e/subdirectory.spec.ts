import { test, expect, chromium } from '@playwright/test';

test('static subdirectory supports entry files, reference audio, capture and actual model inference',async({},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop-chromium','Run the additional real model session once.');
  test.setTimeout(150_000);
  const prefix='http://127.0.0.1:4175/temp/LearnVoice/';
  const browser=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  try{
    const context=await browser.newContext({permissions:['microphone']});
    const requests:string[]=[],failures:string[]=[];
    context.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
    context.on('response',response=>{if(response.status()>=400)failures.push(`${response.status()} ${response.url()}`);});
    const page=await context.newPage();
    // Both a directory entry and index.html with query/hash must resolve the same assets.
    for(const entry of ['', 'index.html?test=1#voice']){
      await page.goto(prefix+entry);
      await expect(page.getByRole('heading',{name:/认真听见/})).toBeVisible();
      expect(await page.locator('link[rel="stylesheet"]').evaluate((el:HTMLLinkElement)=>Boolean(el.sheet))).toBe(true);
    }
    const iconUrl=await page.locator('link[rel="icon"]').evaluate((el:HTMLLinkElement)=>el.href);
    expect(iconUrl).toBe(prefix+'favicon.svg');
    // Headless Chromium may not request tab icons automatically.
    expect(await page.evaluate(async url=>(await fetch(url)).ok,iconUrl)).toBe(true);
    await page.getByRole('button',{name:'听发音示范',exact:true}).click();
    await expect(page.getByTestId('reference-audio')).toHaveJSProperty('paused',false);
    await page.getByRole('button',{name:'开始录音',exact:true}).click();
    await expect(page.getByRole('button',{name:'结束录音'})).toBeVisible();
    await page.waitForTimeout(700);
    await page.getByRole('button',{name:'结束录音'}).click();
    await expect(page.getByRole('button',{name:'回放录音'})).toBeEnabled();
    await page.locator('input[type=file]').setInputFiles('public/references/ship.ogg');
    await page.getByRole('button',{name:'开始本地分析'}).click();
    await expect(page.getByRole('button',{name:'引擎已就绪'})).toBeVisible({timeout:110_000});
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('voice-lab-observations-v1')!)[0]);
    expect(saved.engine).toBe('ONNX Runtime Web · WASM');
    expect(saved.elapsedMs).toBeGreaterThan(0);
    // AudioWorklet requests are not always exposed by Playwright's request event;
    // successful real capture above verifies that module without a mock or root fallback.
    for(const resource of ['favicon.svg','references/cat.ogg','models/phoneme/vocab.json','models/phoneme/model.onnx','ort/ort-wasm-simd-threaded.wasm']) expect(requests).toContain(prefix+resource);
    expect(requests.every(url=>url.startsWith(prefix))).toBe(true);
    expect(failures).toEqual([]);
    await testInfo.attach('subdirectory-requests.json',{body:JSON.stringify(requests,null,2),contentType:'application/json'});
  }finally{await browser.close();}
});
