import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser=await chromium.launch();
try{
  await mkdir('artifacts',{recursive:true});
  const page=await browser.newPage({viewport:{width:1280,height:1000}});
  await page.goto(process.env.VOICE_LAB_URL || 'http://127.0.0.1:4174');
  const results=[];
  for(const word of ['cat','cap','ship','sheep','map','sun']){
    await page.getByRole('button',{name:word,exact:true}).click();
    await page.locator('input[type=file]').setInputFiles(`public/references/${word}.ogg`);
    await page.getByRole('button',{name:'开始本地分析'}).click();
    await page.getByRole('heading',{name:'家长听起来怎么样？'}).waitFor({timeout:120000});
    const result=await page.evaluate(()=>JSON.parse(localStorage.getItem('voice-lab-observations-v1'))[0]);
    results.push(result);
    console.log(JSON.stringify({target:word,phones:result.phones.map(p=>p.token),score:result.score.value,verdict:result.verdict,elapsedMs:result.elapsedMs}));
  }
  await writeFile('artifacts/reference-inference.json',JSON.stringify(results,null,2));
  await page.screenshot({path:'artifacts/practice-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'artifacts/practice-mobile.png',fullPage:true});
}finally{await browser.close();}
