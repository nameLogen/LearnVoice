import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('artifacts', {recursive:true});
const browser=await chromium.launch({headless:true});
try {
  for(const [name,width,height] of [['desktop',1280,1000],['mobile',390,844]]){
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    await page.goto('http://127.0.0.1:4173');
    await page.screenshot({path:`artifacts/${name}.png`,fullPage:true});
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:1280,height:1000}});
  await page.goto('http://127.0.0.1:4173');
  for(const word of ['cat','cap','ship']){
    await page.locator('input[type=file]').setInputFiles(`artifacts/samples/${word}.wav`);
    await page.getByRole('button',{name:'开始本地分析'}).click();
    await page.getByRole('heading',{name:'家长听起来怎么样？'}).waitFor({timeout:100000});
    const results=await page.evaluate(()=>JSON.parse(localStorage.getItem('voice-lab-observations-v1')));
    console.log(JSON.stringify({spoken:word,target:results[0].target.text,phones:results[0].phones.map(p=>p.token),verdict:results[0].verdict,elapsedMs:results[0].elapsedMs}));
    await writeFile('artifacts/spoken-model-results.json',JSON.stringify(results,null,2));
  }
  await page.screenshot({path:'artifacts/model-result.png',fullPage:true});
}finally{await browser.close();}
