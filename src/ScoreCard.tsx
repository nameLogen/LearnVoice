import type { Observation } from './types';
import { previousComparable } from './scoring';

export function ScoreCard({observation,history}:{observation:Observation;history:Observation[]}){
  const score=observation.score;
  if(!score)return <p className="score-note">旧记录没有接近度；重新录一遍即可查看。</p>;
  if(score.value===null)return <div className="practice-score unavailable"><h4>本次暂不计分</h4><p>{score.reason}</p></div>;
  const previous=previousComparable(observation,history);
  const delta=previous?.score?.value==null?null:score.value-previous.score.value;
  return <section className="practice-score" aria-label="音素接近度">
    <div className="score-heading"><div><p>音素接近度</p><span>实验参考 · 越高表示模型输出越接近目标</span></div><strong data-testid="practice-score">{score.value}<small> / 100</small></strong></div>
    <meter min={0} max={100} value={score.value} aria-label="音素接近度"/>
    <p className="score-trend">{delta===null?'同一题再试一次，就能对照前后变化。':delta>0?`比上次增加 ${delta} 点，模型输出更接近目标了。`:delta<0?`比上次减少 ${-delta} 点；先回放，不用急着判断自己退步了。`:'与上次相同。相同音素内的细微变化，这个分数还分不出来。'}</p>
    <div className="sound-steps">{score.steps.map((step,i)=><div key={i} className={step.similarity===100?'aligned':'practice'}><b>/{step.expected??'额外音'}/</b><span>{step.actual?`听到 /${step.actual}/`:'没有听到'}</span><small>{step.similarity===100?'已对齐':step.similarity>0?`接近度 ${step.similarity}`:'再听一遍'}</small></div>)}</div>
    <div className="practice-tip"><b>下一遍，可以试试</b><p>{score.tip}</p></div>
    <p className="score-note">{score.reason} 不是与示范录音直接比对；不评价声音是否好听。模型可能听错，100 也不代表标准发音。</p>
  </section>;
}
