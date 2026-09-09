import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Headphones, Square } from 'lucide-react';
import catalog from '../public/references/catalog.json';
import { appAssetUrl } from './assets';

export interface ReferencePlayerHandle { stop(): void }
export const ReferencePlayer = forwardRef<ReferencePlayerHandle, {targetId:string;disabled:boolean;beforePlay():void}>(function ReferencePlayer({targetId,disabled,beforePlay},ref){
  const reference=catalog[targetId as keyof typeof catalog];
  const element=useRef<HTMLAudioElement>(null);
  const request=useRef(0);
  const [playing,setPlaying]=useState(false);
  const [error,setError]=useState('');
  function stop(){request.current++;element.current?.pause();if(element.current)element.current.currentTime=0;setPlaying(false);}
  useImperativeHandle(ref,()=>({stop}));
  useEffect(()=>{
    setError('');setPlaying(false);
    const player=element.current;
    return ()=>{request.current++;player?.pause();};
  },[targetId]);
  useEffect(()=>{if(disabled)stop();},[disabled]);
  useEffect(()=>{
    const hide=()=>{if(document.hidden)stop();};
    document.addEventListener('visibilitychange',hide);
    return ()=>document.removeEventListener('visibilitychange',hide);
  },[]);
  async function play(){
    if(playing){stop();return;}
    if(disabled || !element.current)return;
    beforePlay();setError('');
    const player=element.current,token=++request.current;
    player.currentTime=0;
    try{await player.play();if(token===request.current)setPlaying(true);}
    catch{if(token===request.current)setError('示范暂时无法播放，请重试；若仍失败，请重新安装包含示范音频的版本。');}
  }
  return <div className="reference-player">
    <button className="reference-button" disabled={disabled} onClick={()=>void play()}>{playing?<Square size={18}/>:<Headphones size={18}/>} {playing?'停止示范':'听发音示范'}</button>
    <span className="reference-caption">{reference.label} · 离线播放</span>
    {reference.note && <p className="reference-note">{reference.note}</p>}
    {error && <p role="alert" className="reference-error">{error}</p>}
    <audio key={targetId} ref={element} data-testid="reference-audio" src={appAssetUrl(reference.path)} preload="none" onEnded={()=>setPlaying(false)} onPause={()=>setPlaying(false)} onError={()=>setError('示范文件无法读取，请检查安装包或重新安装。')}/>
    <details className="reference-credit"><summary>示范来源与许可</summary><p>录音：{reference.author} · {reference.license}</p><p>真人参考录音，尚未经过教学机构审核。</p><p>{reference.changes}</p><a href={reference.source} target="_blank" rel="noreferrer">原文件</a><span> · </span><a href={reference.licenseUrl} target="_blank" rel="noreferrer">许可说明</a></details>
  </div>;
});
