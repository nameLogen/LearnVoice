import { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, Download, Headphones, Plus, Square, Upload, X } from 'lucide-react';
import { articleParts, decodeLibrary, loadArticles, saveArticles, validateArticle, wordPieces, type ReadingArticle, type ReadingSentence } from './articles';
import { lookupWord } from './dictionary';
import { NO_VOICE, offlineVoices, speakOffline, stopSpeech, type OfflineVoice } from './offlineSpeech';
import { ReadingPractice } from './ReadingPractice';
import { ReferencePlayer, type ReferencePlayerHandle } from './ReferencePlayer';
import { targets } from './targets';
import { VoiceLab, isAndroid } from './native';
import type { Observation, Target } from './types';
import './reading.css';

export function ArticleReader({ onObservation, onBusy }: { onObservation(o: Observation): void; onBusy(busy: boolean): void }) {
  const [initial] = useState(() => { try { return { articles: loadArticles(), error: '' }; } catch { return { articles: [] as ReadingArticle[], error: '本机文章读取失败，原数据尚未覆盖。可先导出备份后再导入文章。' }; } });
  const [articles, setArticles] = useState(initial.articles);
  const [selected, setSelected] = useState(() => {
    try { const saved = localStorage.getItem('voice-lab-selected-article'); if (initial.articles.some(a => a.id === saved)) return saved!; } catch { /* library error is shown above */ }
    return initial.articles[0]?.id ?? '';
  });
  const article = articles.find(a => a.id === selected);
  const paragraphs = article ? articleParts(article.text) : [];
  const [editing, setEditing] = useState(false), [title, setTitle] = useState(''), [content, setContent] = useState('');
  const [error, setError] = useState(initial.error);
  const [voices, setVoices] = useState<OfflineVoice[]>([]), [voiceId, setVoiceId] = useState('');
  const [detecting, setDetecting] = useState(false), [voiceError, setVoiceError] = useState('');
  const [rate, setRate] = useState(.85);
  const [playing, setPlaying] = useState('');
  const [word, setWord] = useState(''), [target, setTarget] = useState<Target | null>(null), [looking, setLooking] = useState(false);
  const [wordError, setWordError] = useState('');
  const [practice, setPractice] = useState<{ paragraph: string; sentence: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const playback = useRef(0), lookup = useRef(0), voiceRequest = useRef(0);
  const reference = useRef<ReferencePlayerHandle>(null);
  const importFile = useRef<HTMLInputElement>(null), importBackup = useRef<HTMLInputElement>(null);
  const wordPanel = useRef<HTMLDivElement>(null), practicePanel = useRef<HTMLDivElement>(null);
  const reader = useRef<HTMLElement>(null);
  const sentence = practice ? paragraphs.find(p => p.id === practice.paragraph)?.sentences[practice.sentence] : undefined;
  const completed = article?.completed.length ?? 0;
  const sentenceCount = paragraphs.reduce((n,p) => n + p.sentences.length, 0);
  const preset = targets.find(t => t.mode === 'english' && t.text === word.toLowerCase());

  useEffect(() => { void detect(); return () => { voiceRequest.current++; lookup.current++; playback.current++; void stopSpeech().catch(() => {}); }; }, []);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  useEffect(() => { try { localStorage.setItem('voice-lab-selected-article', selected); } catch { setError('设备存储不可用，文章选择未保存。'); } }, [selected]);
  useEffect(() => {
    const hide = () => { if (document.hidden) void silence().catch(() => {}); };
    document.addEventListener('visibilitychange', hide); return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  useEffect(() => { if (word) wordPanel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [word]);
  useEffect(() => { if (practice) practicePanel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [practice]);

  async function detect() {
    const token = ++voiceRequest.current; setDetecting(true); setVoiceError('');
    try {
      const found = await offlineVoices(); if (token !== voiceRequest.current) return;
      setVoices(found); setVoiceId(old => found.some(v => v.id === old) ? old : found[0]?.id ?? '');
      if (!found.length) setVoiceError(NO_VOICE);
    } catch (e) { if (token === voiceRequest.current) { setVoices([]); setVoiceId(''); setVoiceError(e instanceof Error ? e.message : NO_VOICE); } }
    finally { if (token === voiceRequest.current) setDetecting(false); }
  }
  async function silence() { playback.current++; setPlaying(''); reference.current?.stop(); await stopSpeech(); }
  function pauseReplay() { reader.current?.querySelectorAll<HTMLAudioElement>('.reading-practice audio').forEach(a => a.pause()); }
  function stopSafely() { void silence().catch(e => setError(e instanceof Error ? e.message : '停止播放失败。')); }
  async function listen(sentences: ReadingSentence[]) {
    if (busy) return;
    setError('');
    const token = ++playback.current;
    try {
      reference.current?.stop(); pauseReplay(); await stopSpeech();
      if (token !== playback.current) return;
      if (!voiceId) throw new Error(NO_VOICE);
      for (const sentence of sentences) {
        if (token !== playback.current || document.hidden) break;
        setPlaying(sentence.id);
        if (!await speakOffline(sentence.text, voiceId, rate)) break;
      }
      if (token === playback.current) setPlaying('');
    } catch (e) { if (token === playback.current) { setPlaying(''); setError(e instanceof Error ? e.message : '朗读失败。'); } }
  }
  function persist(next: ReadingArticle[]): boolean {
    try { saveArticles(next); setArticles(next); return true; }
    catch { setError('设备存储空间不足或不可用，本次修改未保存。请先导出备份。'); return false; }
  }
  function addArticle() {
    try {
      validateArticle(title, content);
      if (articles.length >= 20) throw new Error('最多保存 20 篇，请先备份并移除不需要的文章。');
      const entry: ReadingArticle = { id: crypto.randomUUID(), title: title.trim(), text: content.trim(), completed: [] };
      if (persist([...articles, entry])) { stopSafely(); setSelected(entry.id); setEditing(false); setTitle(''); setContent(''); closePractice(); setError(''); }
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败。'); }
  }
  function closePractice() { lookup.current++; setWord(''); setTarget(null); setPractice(null); }
  async function chooseWord(value: string) {
    if (busy) return;
    stopSafely(); setPractice(null); setWord(value); setTarget(null); setWordError(''); setLooking(true);
    const token = ++lookup.current;
    try { const result = await lookupWord(value); if (token === lookup.current) setTarget(result); }
    catch (e) { if (token === lookup.current) setWordError(e instanceof Error ? e.message : '词典读取失败。'); }
    finally { if (token === lookup.current) setLooking(false); }
  }
  function startParagraph(id: string) {
    stopSafely(); closePractice(); setPractice({ paragraph: id, sentence: 0 });
  }
  function completeSentence() {
    if (!article || !sentence || !practice) return;
    const next = articles.map(a => a.id === article.id ? { ...a, completed: [...new Set([...a.completed, sentence.id])] } : a);
    if (!persist(next)) return;
    const length = paragraphs.find(p => p.id === practice.paragraph)!.sentences.length;
    if (practice.sentence + 1 < length) setPractice({ ...practice, sentence: practice.sentence + 1 });
    else { setPractice(null); setError(''); }
  }
  async function readFile(file?: File, backup = false) {
    if (!file) return;
    try {
      if (file.size > (backup ? 3_000_000 : 150_000)) throw new Error('文件太大，请拆分后导入。');
      const raw = (await file.text()).replace(/^\uFEFF/, '');
      if (backup) {
        const incoming = decodeLibrary(raw);
        if (articles.length + incoming.length > 20) throw new Error('导入后超过 20 篇，请先备份并移除部分文章。');
        const added = incoming.map(a => ({ ...a, id: crypto.randomUUID() }));
        if (persist([...articles, ...added]) && added[0]) { stopSafely(); closePractice(); setSelected(added[0].id); setError(''); }
      } else { setTitle(file.name.replace(/\.txt$/i, '').slice(0,100)); setContent(raw); setEditing(true); }
    } catch (e) { setError(e instanceof Error ? e.message : '导入失败，请使用 UTF-8 文本。'); }
    finally { if (importFile.current) importFile.current.value = ''; if (importBackup.current) importBackup.current.value = ''; }
  }
  async function exportLibrary() {
    try {
      const content = initial.error && !articles.length ? localStorage.getItem('voice-lab-articles-v1') ?? '[]' : JSON.stringify(articles, null, 2);
      if (isAndroid) await VoiceLab.exportFile({ name: 'voice-lab-articles.json', content });
      else {
        const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'voice-lab-articles.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) { setError(e instanceof Error ? e.message : '导出失败。'); }
  }

  return <section className="reader" ref={reader}>
    <div className="reader-heading"><div><p className="eyebrow">MY LITTLE STORYBOOK</p><h2>把故事，读给世界听。</h2><p>点一个词，听一个声音。每一小句，都是新的进步。</p></div><BookOpen size={48} strokeWidth={1.2}/></div>
    <div className="library-tools">
      <label>我的文章<select aria-label="选择文章" value={selected} disabled={busy} onChange={e => { stopSafely(); closePractice(); setSelected(e.target.value); }}>{!articles.length && <option value="">还没有文章</option>}{articles.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
      <button className="primary" disabled={busy} onClick={() => { stopSafely(); setEditing(!editing); }}><Plus size={16}/> 添加文章</button>
      <button className="text-button" disabled={busy} onClick={() => importFile.current?.click()}><Upload size={16}/> 导入 TXT</button>
      <details className="library-backup"><summary>备份与管理</summary><button className="text-button" disabled={busy} onClick={() => void exportLibrary()}><Download size={15}/> 导出文章备份</button><button className="text-button" disabled={busy} onClick={() => importBackup.current?.click()}>导入文章备份</button>{article && <button className="text-button danger" disabled={busy} onClick={() => {
        if (!window.confirm(`移除《${article.title}》和它的跟读进度？`)) return;
        const remaining = articles.filter(a => a.id !== article.id); if (persist(remaining)) { stopSafely(); closePractice(); setSelected(remaining[0]?.id ?? ''); }
      }}>移除当前文章</button>}</details>
      <input hidden ref={importFile} type="file" accept=".txt,text/plain" onChange={e => void readFile(e.target.files?.[0])}/>
      <input hidden ref={importBackup} type="file" accept=".json,application/json" onChange={e => void readFile(e.target.files?.[0], true)}/>
    </div>
    {error && <p role="alert" className="error">{error}<button aria-label="关闭阅读提示" onClick={() => setError('')}><X size={16}/></button></p>}
    {editing && <form className="article-editor card" onSubmit={e => { e.preventDefault(); addArticle(); }}>
      <label>文章标题<input value={title} maxLength={100} onChange={e => setTitle(e.target.value)} placeholder="例如：A Day at the Park" required/></label>
      <label>英语文章<textarea value={content} onChange={e => setContent(e.target.value)} placeholder="粘贴英语文章，换行分段。" rows={8} required/></label>
      <div className="reading-actions"><button className="primary" disabled={busy} type="submit">保存到我的文章</button><button type="button" className="text-button" onClick={() => setEditing(false)}>收起</button><span>{content.length.toLocaleString()} / 30,000 字符</span></div>
    </form>}
    <div className="offline-voice">
      <span className="voice-badge"><span className={`status-dot ${voiceId ? 'ready' : ''}`}/>离线合成朗读</span>
      <label className="voice-select">声音<select aria-label="离线英语声音" disabled={!voices.length || busy || !!playing} value={voiceId} onChange={e => setVoiceId(e.target.value)}>{!voices.length && <option value="">尚无可用声音</option>}{voices.map(v => <option key={v.id} value={v.id}>{v.name} · {v.lang}</option>)}</select></label>
      <label>语速<select aria-label="朗读语速" value={rate} disabled={busy || !!playing} onChange={e => setRate(Number(e.target.value))}><option value={.65}>慢一点</option><option value={.85}>舒缓</option><option value={1}>正常</option></select></label>
      <button className="text-button" disabled={detecting || busy || !!playing} onClick={() => void detect()}>{detecting ? '检测中…' : '重新检测'}</button>
      {voiceError && <p className="voice-help" role="status">{voiceError}</p>}
      <small>只使用本地英语声音。合成朗读不是人工录音；单词参考以美式词典为准。</small>
    </div>
    {article && <div className="reading-layout"><article className="story-paper">
      <div className="story-title"><span className="story-index">READ & GROW</span><h3 lang="en">{article.title}</h3><p>已练 {completed} / {sentenceCount} 小句 · 完成进度，不是准确率</p><progress aria-label="文章跟读进度" value={completed} max={Math.max(1,sentenceCount)}/></div>
      <div className="reading-actions"><button className="primary" disabled={busy || !voiceId} onClick={() => void listen(paragraphs.flatMap(p => p.sentences))}><Headphones size={18}/> 全文播放</button><button className="text-button" disabled={!playing} onClick={stopSafely}><Square size={15}/> 停止朗读</button></div>
      <div className="story-paragraphs">{paragraphs.map((p,index) => <section key={p.id} className={`story-paragraph ${practice?.paragraph === p.id ? 'practising' : ''}`} aria-label={`第 ${index+1} 段`}>
        <div className="paragraph-tools"><span>{String(index+1).padStart(2,'0')}</span><button disabled={busy || !voiceId} onClick={() => void listen(p.sentences)}>听第 {index+1} 段</button><button disabled={busy} onClick={() => startParagraph(p.id)}>跟读第 {index+1} 段</button>{p.sentences.every(s => article.completed.includes(s.id)) && <Check size={17} aria-label="本段已练习"/>}</div>
        <p lang="en">{p.sentences.map(s => <span key={s.id} className={`story-sentence ${playing === s.id ? 'speaking' : ''} ${sentence?.id === s.id ? 'current-sentence' : ''}`}>{wordPieces(s.text).map((piece,i) => piece.word ? <button key={i} className={`story-word ${word === piece.text ? 'chosen' : ''}`} disabled={busy} aria-label={`练习单词 ${piece.text}`} onClick={() => void chooseWord(piece.text)}>{piece.text}</button> : <span key={i}>{piece.text}</span>)}{' '}</span>)}</p>
      </section>)}</div>
      <p className="story-end">✳ 每一遍，都多一点熟悉。</p>
    </article><aside className="reader-aside">
      {word ? <div ref={wordPanel} className="card word-card"><div className="section-top"><span className="eyebrow">WORD EXPLORER</span><button className="text-button" aria-label="关闭单词卡" disabled={busy} onClick={() => { stopSafely(); closePractice(); }}><X size={18}/></button></div><h3 lang="en">{word}</h3><p className="word-ipa">{looking ? '正在查本地词典…' : target?.ipa ?? '暂未收录音标'}</p>{wordError && <p role="alert" className="reference-error">{wordError}</p>}
        {preset ? <ReferencePlayer ref={reference} targetId={preset.id} disabled={busy} beforePlay={() => { playback.current++; setPlaying(''); pauseReplay(); void stopSpeech().catch(() => {}); }}/>
        : <button className="reference-button" disabled={busy || !voiceId} onClick={() => void listen([{id:'word',text:word}])}><Headphones size={18}/> 听单词发音</button>}
        {!preset && <p className="muted-small">设备离线合成 · 可重复听</p>}
        {target && <p className="word-source">{target.hint}</p>}
        {!looking && <ReadingPractice key={`word:${word}`} text={word} target={target} word beforeRecord={silence} onBusy={setBusy} onObservation={onObservation}/>}
      </div> : sentence && practice ? <div ref={practicePanel} className="card sentence-card"><div className="section-top"><span className="eyebrow">ONE SMALL STEP</span><button className="text-button" aria-label="关闭段落跟读" disabled={busy} onClick={() => { stopSafely(); setPractice(null); }}><X size={18}/></button></div><h3>一句一句，慢慢读</h3><p className="muted-small">本段第 {practice.sentence+1} / {paragraphs.find(p=>p.id===practice.paragraph)!.sentences.length} 小句</p>
        <button className="reference-button" disabled={busy || !voiceId} onClick={() => void listen([sentence])}><Headphones size={18}/> 听这一句</button>
        <ReadingPractice key={`${article.id}:${sentence.id}`} text={sentence.text} target={null} word={false} beforeRecord={silence} onBusy={setBusy} onObservation={onObservation} onComplete={completeSentence}/>
      </div> : <div className="reading-invitation"><span>✳</span><h3>一个词，一扇小窗。</h3><p>点故事里的任意单词，听发音、试着读。<br/>也可以选一段，开启逐句跟读。</p><small>文章和练习进度保存在这台设备上，记得定期导出备份。</small></div>}
    </aside></div>}
    {!article && <div className="history-empty"><BookOpen size={40}/><h3>第一篇故事，从粘贴文字开始。</h3></div>}
  </section>;
}
