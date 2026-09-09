import { test, expect } from '@playwright/test';
import catalog from '../../public/references/catalog.json' with { type: 'json' };

test('all bundled references decode locally and playback stops on navigation',async({page})=>{
  await page.goto('/');
  for(const reference of Object.values(catalog)){
    const decoded=await page.evaluate(async path=>{
      const ctx=new AudioContext();
      try{const response=await fetch(path);if(!response.ok)throw new Error('missing reference');const audio=await ctx.decodeAudioData(await response.arrayBuffer());return {duration:audio.duration,peak:audio.getChannelData(0).reduce((p,x)=>Math.max(p,Math.abs(x)),0)};}
      finally{await ctx.close();}
    },reference.path);
    expect(decoded.duration).toBeGreaterThan(.25);expect(decoded.duration).toBeLessThan(5);expect(decoded.peak).toBeGreaterThan(.005);
  }
  await page.getByRole('button',{name:'听发音示范',exact:true}).click();
  const player=page.getByTestId('reference-audio');
  await expect(player).toHaveJSProperty('paused',false);
  await page.getByRole('button',{name:'cap',exact:true}).click();
  await expect(player).toHaveAttribute('src','http://127.0.0.1:4173/references/cap.ogg');
  await expect(player).toHaveJSProperty('paused',true);
  await page.getByRole('button',{name:'拼音观察',exact:true}).click();
  await expect(page.getByText('示范读“妈妈”，请只跟读第一个 mā。')).toBeVisible();
  await page.getByRole('button',{name:'听发音示范',exact:true}).click();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(player).toHaveJSProperty('paused',true);
});

test('proximity, sound guidance, trend and export survive reload',async({page})=>{
  await page.goto('/');
  // Recorded inference fixtures test presentation/persistence independently from model accuracy.
  await page.evaluate(()=>{
    const base={createdAt:'2026-09-09T00:00:00Z',target:{id:'cat',mode:'english',text:'cat',ipa:'/kæt/',phones:[['k','æ','t']],hint:''},quality:{duration:1,rmsDb:-20,peak:.5,clipping:0,reason:null},pitch:[],phones:[{token:'k',confidence:.9,start:0,end:.1},{token:'ɛ',confidence:.9,start:.1,end:.3},{token:'t',confidence:.9,start:.3,end:.4}],elapsedMs:300,engine:'fixture',modelRevision:'fixture1',verdict:'different',explanation:'测试记录',parentLabel:null,note:''};
    const make=(id:string,value:number)=>({...base,id,score:{version:'phone-distance-v1',value,reason:'实验参考，不是发音准确率。',tip:'模型在 /æ/ 的位置听到 /ɛ/。试着把嘴张开一些。',steps:[{expected:'k',actual:'k',similarity:100},{expected:'æ',actual:'ɛ',similarity:68},{expected:'t',actual:'t',similarity:100}]}});
    localStorage.setItem('voice-lab-observations-v1',JSON.stringify([make('new',89),make('old',70)]));
  });
  await page.reload();await page.getByRole('button',{name:/观察记录/}).click();
  await page.locator('.history-item summary').first().click();
  await expect(page.getByTestId('practice-score').first()).toHaveText('89 / 100');
  await expect(page.getByText('比上次增加 19 点，模型输出更接近目标了。')).toBeVisible();
  await expect(page.getByText(/试着把嘴张开一些/).first()).toBeVisible();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出 JSON'}).click();
  const download=await downloadPromise;const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream!)chunks.push(chunk);
  const result=JSON.parse(Buffer.concat(chunks).toString());
  expect(result.schemaVersion).toBe(2);expect(result.observations[0].score.value).toBe(89);expect(result.observations[0].score.version).toBe('phone-distance-v1');
});
