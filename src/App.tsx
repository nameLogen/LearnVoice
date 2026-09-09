import { useEffect, useRef, useState } from 'react';
import { AudioLines, ArrowRight, Check, CheckCircle2, ChevronDown, CircleHelp, Download, FlaskConical, Headphones, History, LoaderCircle, Mic, Play, ShieldCheck, Square, Trash2, Upload, X } from 'lucide-react';
import { targets } from './targets';
import { analyse, prepareModel } from './inference';
import { startRecorder, readAudioFile, type Recorder } from './audio';
import { comparePhones, encodeWav, extractPitch, inspectAudio, MAX_SECONDS } from './speech';
import { exportObservations, loadObservations, saveObservations } from './storage';
import { isAndroid } from './native';
import manifest from '../models/manifest.json';
import type { Mode, Observation, PitchPoint } from './types';
import { ReferencePlayer, type ReferencePlayerHandle } from './ReferencePlayer';
import { ScoreCard } from './ScoreCard';
import { scorePronunciation } from './scoring';

const modeLabels: Record<Mode,string> = { english: '英语单词', phoneme: '单独音素', pinyin: '拼音观察' };
const verdictLabels = { match: '音素序列相符', different: '音素序列不同', uncertain: '暂时无法判断', observation: '等待家长观察' };
const parentLabels = { correct: '发音符合目标', incorrect: '发音不符合目标', unsure: '暂不确定' };

function PitchChart({ points }: { points: PitchPoint[] }) {
  if (points.length < 4) return <div className="chart-empty">没有足够稳定的音高。清辅音通常没有音高，这是正常现象。</div>;
  const start = points[0].time, end = points[points.length - 1].time;
  const low = Math.min(...points.map(p => p.hz)), high = Math.max(...points.map(p => p.hz));
  const x = (t: number) => 12 + (t - start) / Math.max(0.1, end - start) * 376;
  const y = (hz: number) => 80 - (hz - low) / Math.max(50, high - low) * 60;
  return <div className="pitch-chart"><svg viewBox="0 0 400 100" role="img" aria-label={`音高观察，最低 ${Math.round(low)} 赫兹，最高 ${Math.round(high)} 赫兹`}>
    {[20,50,80].map(row => <line key={row} x1="0" y1={row} x2="400" y2={row} stroke="currentColor" strokeDasharray="3 5" opacity=".15" />)}
    {points.map((p,i) => i && p.time - points[i-1].time < .07 ? <line key={i} x1={x(points[i-1].time)} y1={y(points[i-1].hz)} x2={x(p.time)} y2={y(p.hz)} stroke="#C78948" strokeWidth="2.5" strokeLinecap="round" /> : null)}
  </svg><span>{Math.round(low)}–{Math.round(high)} Hz · 音高提取可能有倍频误差，不用于判声调</span></div>;
}

export default function App() {
  const [mode, setMode] = useState<Mode>('english');
  const [targetId, setTargetId] = useState('cat');
  const target = targets.find(t => t.id === targetId)!;
  const [tab, setTab] = useState<'lab'|'history'>('lab');
  const [phase, setPhase] = useState<'idle'|'requesting'|'recording'|'analysing'>('idle');
  const [modelState, setModelState] = useState<'cold'|'loading'|'ready'|'error'>('cold');
  const [engine, setEngine] = useState('');
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [observations, setObservations] = useState<Observation[]>(loadObservations);
  const [current, setCurrent] = useState<Observation | null>(null);
  const [clip, setClip] = useState<Float32Array | null>(null);
  const [clipUrl, setClipUrl] = useState('');
  const [playing, setPlaying] = useState(false);
  const [clearPrompt, setClearPrompt] = useState(false);
  const [exporting, setExporting] = useState(false);
  const recorder = useRef<Recorder | null>(null);
  const recordingToken = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const referencePlayer = useRef<ReferencePlayerHandle>(null);
  const busy = phase !== 'idle' || modelState === 'loading';

  useEffect(() => {
    try { saveObservations(observations); } catch { setError('设备存储空间不足，记录未能保存。请导出当前记录。'); }
  }, [observations]);
  useEffect(() => {
    if (!clip) { setClipUrl(''); return; }
    const url = URL.createObjectURL(encodeWav(clip)); setClipUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [clip]);
  useEffect(() => {
    return () => { recordingToken.current++; void recorder.current?.cancel(); };
  }, []);
  useEffect(() => {
    const hide = () => {
      if (document.hidden && recorder.current) {
        recordingToken.current++; void recorder.current.cancel(); recorder.current = null;
        setPhase('idle'); setLevel(0); setError('切换到后台已停止录音，请返回后重新开始。');
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  useEffect(() => {
    if (phase !== 'recording') return;
    const start = performance.now();
    const timer = setInterval(() => setSeconds((performance.now() - start) / 1000), 100);
    const stop = setTimeout(() => void stopRecording(), MAX_SECONDS * 1000);
    return () => { clearInterval(timer); clearTimeout(stop); };
  }, [phase]);

  function resetClip() { audio.current?.pause(); setPlaying(false); setCurrent(null); setClip(null); setError(''); }
  function changeMode(value: Mode) { resetClip(); setMode(value); setTargetId(targets.find(t => t.mode === value)!.id); }
  async function prepare() {
    setError(''); setModelState('loading');
    try { const result = await prepareModel(); setEngine(result.engine); setModelState('ready'); }
    catch (e) { setModelState('error'); setError(e instanceof Error ? e.message : String(e)); }
  }
  async function startRecording() {
    if (busy) return;
    referencePlayer.current?.stop(); resetClip(); setSeconds(0); setPhase('requesting');
    const token = ++recordingToken.current;
    try {
      const active = await startRecorder(setLevel);
      if (recordingToken.current !== token || document.hidden) { await active.cancel(); setPhase('idle'); return; }
      recorder.current = active; setPhase('recording');
    } catch (e) {
      setPhase('idle'); setError(e instanceof DOMException && e.name === 'NotAllowedError' ? '麦克风权限未开启，请在应用或浏览器设置中允许麦克风后重试。' : e instanceof Error ? e.message : String(e));
    }
  }
  async function stopRecording() {
    const active = recorder.current;
    if (!active) return;
    recorder.current = null; setPhase('analysing'); setLevel(0);
    try { setClip(await active.stop()); setPhase('idle'); }
    catch (e) { setPhase('idle'); setError(e instanceof Error ? e.message : String(e)); }
  }
  async function runAnalysis() {
    if (!clip || busy) return;
    setPhase('analysing'); setError('');
    const quality = inspectAudio(clip);
    try {
      const raw = quality.reason ? { phones: [], elapsedMs: 0, engine: '录音质量检查' } : await analyse(clip);
      const comparison = quality.reason ? { verdict: 'uncertain' as const, explanation: quality.reason } : comparePhones(target, raw.phones);
      const result: Observation = {
        id: crypto.randomUUID(), createdAt: new Date().toISOString(), target, quality,
        pitch: quality.reason ? [] : extractPitch(clip), ...raw, ...comparison,
        modelRevision: manifest.revision, parentLabel: null, note: '',
        score: scorePronunciation(target, raw.phones, quality),
      };
      setCurrent(result); setObservations(old => [result, ...old].slice(0,200));
      if (!quality.reason) { setModelState('ready'); setEngine(raw.engine); }
    } catch (e) { setModelState('error'); setError(e instanceof Error ? e.message : String(e)); }
    finally { setPhase('idle'); }
  }
  async function importAudio(file?: File) {
    if (!file) return;
    resetClip(); setPhase('analysing');
    try { setClip(await readAudioFile(file)); }
    catch (e) { setError(e instanceof Error ? e.message : '无法读取录音，请尝试 WAV 文件。'); }
    finally { setPhase('idle'); if (importRef.current) importRef.current.value = ''; }
  }
  function updateObservation(id: string, change: Partial<Observation>) {
    setObservations(old => old.map(o => o.id === id ? { ...o, ...change } : o));
    setCurrent(old => old?.id === id ? { ...old, ...change } : old);
  }
  async function togglePlayback() {
    referencePlayer.current?.stop();
    if (!audio.current) return;
    if (playing) { audio.current.pause(); setPlaying(false); }
    else { try { await audio.current.play(); setPlaying(true); } catch { setError('暂时无法播放这段录音，请重新录制。'); } }
  }
  async function exportData() {
    setExporting(true);
    try { await exportObservations(observations); }
    catch (e) { setError(e instanceof Error ? e.message : '导出失败，请重试。'); }
    finally { setExporting(false); }
  }
  const validLabels = observations.filter(o => ['match','different'].includes(o.verdict) && ['correct','incorrect'].includes(o.parentLabel ?? ''));
  const falseAccepts = validLabels.filter(o => o.verdict === 'match' && o.parentLabel === 'incorrect').length;
  const falseRejects = validLabels.filter(o => o.verdict === 'different' && o.parentLabel === 'correct').length;
  const incorrectCount = validLabels.filter(o => o.parentLabel === 'incorrect').length;
  const correctCount = validLabels.filter(o => o.parentLabel === 'correct').length;

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#" onClick={event => { event.preventDefault(); setTab('lab'); }}><span className="brand-mark"><AudioLines size={25} /></span><span>小小声音<span className="brand-light">实验室</span><small>LITTLE VOICE LAB</small></span></a><span className="version-pill">家庭测试版 <span>0.2</span></span></header>
    <main>
      <section className="intro"><div><p className="eyebrow"><span /> LISTEN. NOTICE. LEARN.</p><h1>认真听见，<br className="mobile-break" />每一个小声音<span className="sun-dot">。</span></h1><p className="intro-copy">录一小段，听一遍，看看模型听到了什么。</p></div><div className="intro-stamp"><Headphones size={32} strokeWidth={1.5} /><span>声音留在<br />这台设备上</span></div></section>
      <nav className="tabs" aria-label="主要页面"><button className={tab === 'lab' ? 'active' : ''} onClick={() => setTab('lab')}><FlaskConical size={18} /> 语音实验</button><button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History size={18} /> 观察记录 <span className="count">{observations.length}</span></button></nav>
      {error && <div className="error" role="alert"><CircleHelp size={20} /><span>{error}</span><button aria-label="关闭提示" onClick={() => setError('')}><X size={18}/></button></div>}
      {tab === 'lab' ? <div className="lab-grid"><div className="main-column">
        <section className="card experiment-card"><div className="section-top"><span className="step-number">01</span><h2>选一个声音</h2><span className="muted-small">每次专注一个目标</span></div>
          <div className="mode-switch" role="group" aria-label="练习类型">{(Object.keys(modeLabels) as Mode[]).map(m => <button key={m} disabled={busy} className={mode === m ? 'selected' : ''} onClick={() => changeMode(m)}>{modeLabels[m]}</button>)}</div>
          <div className="target-stage"><span className="target-orbit orbit-a"/><span className="target-orbit orbit-b"/><p className="target-label">{mode === 'english' ? 'READ THE WORD' : mode === 'phoneme' ? 'TRY THE SOUND' : 'EXPLORE THE TONE'}</p><div className={`target-text ${mode === 'pinyin' ? 'pinyin' : ''}`}>{target.text}</div><p className="ipa">{target.ipa}</p></div>
          <ReferencePlayer ref={referencePlayer} targetId={targetId} disabled={busy} beforePlay={() => { audio.current?.pause(); setPlaying(false); }}/>
          <div className="target-choices" aria-label="选择目标">{targets.filter(t => t.mode === mode).map(t => <button key={t.id} disabled={busy} aria-pressed={targetId === t.id} className={targetId === t.id ? 'selected' : ''} onClick={() => { resetClip(); setTargetId(t.id); }}>{t.text}</button>)}</div>
          <p className="hint"><CircleHelp size={17}/>{target.hint}</p>
          <div className="record-area"><div className="section-top"><span className="step-number">02</span><h2>录下你的声音</h2><span className="muted-small">最多 {MAX_SECONDS} 秒</span></div>
            <div className={`waveform ${phase === 'recording' ? 'live' : ''}`} aria-hidden="true">{Array.from({length:39},(_,i) => <span key={i} style={{ height: `${8 + (phase === 'recording' ? (isAndroid ? 20 : level * 65) : 10) * (0.4 + Math.sin(i * 1.7) ** 2)}px`, animationDelay: `${i * .04}s` }}/>)}</div>
            <p className="record-status" aria-live="polite">{phase === 'recording' ? `正在听 · ${seconds.toFixed(1)} 秒` : phase === 'requesting' ? '正在请求麦克风权限…' : phase === 'analysing' ? '正在处理，请稍等…' : clip ? `录好了 · ${(clip.length / 16000).toFixed(1)} 秒，可以先回放` : '清晰、自然地说就好，不需要喊'}</p>
            <div className="record-buttons"><button className={`primary record-button ${phase === 'recording' ? 'stop' : ''}`} disabled={busy && phase !== 'recording'} onClick={() => phase === 'recording' ? void stopRecording() : void startRecording()}>{phase === 'recording' ? <Square size={19} fill="currentColor"/> : phase === 'requesting' ? <LoaderCircle className="spin" size={20}/> : <Mic size={20}/>} {phase === 'recording' ? '结束录音' : clip ? '重新录一遍' : '开始录音'}</button><button className="icon-button playback-button" aria-label={playing ? '暂停回放' : '回放录音'} disabled={!clip || busy} onClick={() => void togglePlayback()}>{playing ? <Square size={18}/> : <Play size={19}/>}</button></div>
            <div className="record-footer"><button className="text-button" disabled={busy} onClick={() => importRef.current?.click()}><Upload size={15}/> 导入短录音</button><span>原始录音不自动保存</span></div>
            <input ref={importRef} type="file" accept="audio/*,.wav" hidden onChange={event => void importAudio(event.target.files?.[0])}/>
            <audio ref={audio} src={clipUrl || undefined} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)}/>
          </div>
        </section>
      </div><aside className="side-column">
        <section className="model-card"><div className="model-title"><span className={`status-dot ${modelState === 'ready' ? 'ready' : ''}`}/><h2>离线语音引擎</h2><ShieldCheck size={19}/></div><p>{modelState === 'ready' ? '已就绪，声音在本机分析。' : modelState === 'loading' ? '正在载入模型，首次可能需要稍等。' : '先唤醒模型，准备听一听。'}</p><button className="model-button" disabled={busy} onClick={() => void prepare()}>{modelState === 'loading' ? <LoaderCircle size={17} className="spin"/> : modelState === 'ready' ? <Check size={17}/> : <AudioLines size={17}/>} {modelState === 'ready' ? '引擎已就绪' : modelState === 'loading' ? '载入中…' : '检查并载入模型'}<ArrowRight size={16}/></button><small>{engine || (isAndroid ? 'Android 原生 CPU 推理' : '浏览器 WASM 推理')}<br />模型约 230 MiB · 安装包内置 · 无在线评分服务</small></section>
        <section className="card result-card"><div className="section-top"><span className="step-number">03</span><h2>看看模型听到了什么</h2></div>
          {!current ? <><div className="empty-result"><div className="empty-icon"><AudioLines size={32} strokeWidth={1.3}/></div><h3>{clip ? '声音已准备好' : '等一个小声音'}</h3><p>{clip ? '分析后会显示音素候选，你可以回放核对。' : '完成录音后，这里会出现分析结果和观察提示。'}</p></div><button className="primary analyse-button" disabled={!clip || busy} onClick={() => void runAnalysis()}>{phase === 'analysing' ? <LoaderCircle size={18} className="spin"/> : <FlaskConical size={18}/>} 开始本地分析</button></> : <>
            <ScoreCard observation={current} history={observations}/>
            <div className={`verdict ${current.verdict}`}><span>{current.verdict === 'match' ? <CheckCircle2 size={20}/> : <CircleHelp size={20}/>}</span><h3>{verdictLabels[current.verdict]}</h3></div>
            <p className="output-label">识别到的音素</p><div className="phone-output">{current.phones.length ? current.phones.map((p,i) => <span key={i} title={`模型标签置信度 ${(p.confidence * 100).toFixed(0)}%，不是发音得分`}>{p.token}</span>) : <span className="no-phone">没有可用音素</span>}</div><p className="explanation">{current.explanation}</p>
            <div className="result-meta"><span>录音 {current.quality.duration.toFixed(1)}s</span><span>分析 {(current.elapsedMs / 1000).toFixed(2)}s</span><span>{current.quality.rmsDb.toFixed(0)} dBFS</span></div>
            {current.target.mode === 'pinyin' && <><h4>音高观察</h4><PitchChart points={current.pitch}/></>}
            <div className="parent-review"><h4>家长听起来怎么样？</h4><p>标记孩子实际的发音，帮助检验模型。</p><div className="review-buttons">{(['correct','incorrect','unsure'] as const).map(label => <button key={label} className={current.parentLabel === label ? 'selected' : ''} onClick={() => updateObservation(current.id,{parentLabel:label})}>{parentLabels[label]}</button>)}</div><label className="note-label">观察备注（选填）<textarea value={current.note} maxLength={300} placeholder="例如：故意把 cat 读成 cap，环境安静。" onChange={event => updateObservation(current.id,{note:event.target.value})}/></label></div>
          </>}
        </section>
        <div className="field-note"><span className="note-star">✳</span><div><h3>这是实验，不是考试</h3><p>接近度帮助找到下一遍要练的音，不代表标准发音。儿童声音、口音和环境都可能影响模型，请结合回放。</p></div></div>
      </aside></div> : <section className="history-section"><div className="history-heading"><div><h2>把每一次观察留下来</h2><p>最多保留 200 条本机记录；导出不包含原始录音。</p></div><button className="primary" disabled={!observations.length || exporting} onClick={() => void exportData()}><Download size={17}/> {exporting ? '导出中…' : '导出 JSON'}</button></div>
        <div className="stats-grid"><div><span>已标注 · 可比较样本</span><strong>{validLabels.length}</strong></div><div><span>读错却匹配</span><strong>{falseAccepts}<small> / {incorrectCount}</small></strong></div><div><span>读对却不同</span><strong>{falseRejects}<small> / {correctCount}</small></strong></div></div><p className="stats-note">仅统计英语中“相符／不同”且家长已明确标注的记录。拼音观察、没听清和未标注记录不计入。</p>
        {!observations.length ? <div className="history-empty"><History size={36} strokeWidth={1.3}/><h3>第一条观察，从一次录音开始</h3><button className="text-button" onClick={() => setTab('lab')}>去做个小实验 <ArrowRight size={16}/></button></div> : <div className="history-list">{observations.map(o => <details className="history-item" key={o.id}><summary><div className="history-target">{o.target.text}<small>{modeLabels[o.target.mode]}</small></div><div className="history-summary"><span className={`mini-verdict ${o.verdict}`}>{verdictLabels[o.verdict]}</span><small>{new Date(o.createdAt).toLocaleString('zh-CN', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} · {o.parentLabel ? parentLabels[o.parentLabel] : '未标注'}</small></div><ChevronDown size={17}/></summary><div className="history-detail"><p>识别：{o.phones.map(p => p.token).join(' ') || '无可用音素'}</p><p>{o.explanation}</p><ScoreCard observation={o} history={observations}/><div className="review-buttons">{(['correct','incorrect','unsure'] as const).map(label => <button key={label} className={o.parentLabel === label ? 'selected' : ''} onClick={() => updateObservation(o.id,{parentLabel:label})}>{parentLabels[label]}</button>)}</div>{o.note && <p>备注：{o.note}</p>}<small>{o.engine} · {(o.elapsedMs/1000).toFixed(2)}s</small><button className="text-button danger" onClick={() => { setObservations(old => old.filter(x => x.id !== o.id)); if (current?.id === o.id) setCurrent(null); }}><Trash2 size={14}/> 删除本条</button></div></details>)}</div>}
        {observations.length > 0 && <div className="clear-area">{clearPrompt ? <><span>清空全部本机观察记录？</span><button className="text-button danger" onClick={() => { setObservations([]); setCurrent(null); setClearPrompt(false); }}>确认清空</button><button className="text-button" onClick={() => setClearPrompt(false)}>取消</button></> : <button className="text-button danger" onClick={() => setClearPrompt(true)}><Trash2 size={14}/> 清空记录</button>}</div>}
      </section>}
      <footer><span><ShieldCheck size={14}/> 录音本地处理 · 不上传声音</span><span>为好奇心，留一点耐心。</span></footer>
    </main>
  </div>;
}
