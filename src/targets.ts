import type { Target } from './types';

export const targets: Target[] = [
  { id: 'cat', mode: 'english', text: 'cat', ipa: '/kæt/', phones: [['k','æ','t']], hint: '试试读 cat，再故意读 cap，看看模型能否分辨。' },
  { id: 'cap', mode: 'english', text: 'cap', ipa: '/kæp/', phones: [['k','æ','p']], hint: '注意最后一个声音 /p/，不用额外读一个“坡”。' },
  { id: 'ship', mode: 'english', text: 'ship', ipa: '/ʃɪp/', phones: [['ʃ','ɪ','p']], hint: '用 ship 和 sheep 做一组对照。' },
  { id: 'sheep', mode: 'english', text: 'sheep', ipa: '/ʃiːp/', phones: [['ʃ','iː','p'],['ʃ','i','p']], hint: '元音与 ship 不同；不仅仅是把声音拖长。' },
  { id: 'map', mode: 'english', text: 'map', ipa: '/mæp/', phones: [['m','æ','p']], hint: '先完整读一遍，再试试漏掉末尾 /p/。' },
  { id: 'sun', mode: 'english', text: 'sun', ipa: '/sʌn/', phones: [['s','ʌ','n'],['s','ɐ','n']], hint: '自然说出一个单词，停顿后结束录音。' },
  { id: 'ae', mode: 'phoneme', text: '/æ/', ipa: '如 cat 中的 a', phones: [['æ']], hint: '只读这个声音。孤立音素是实验项，模型可能比整词更不稳定。' },
  { id: 'ih', mode: 'phoneme', text: '/ɪ/', ipa: '如 ship 中的 i', phones: [['ɪ']], hint: '不要读字母 I 的名称，只读 /ɪ/。' },
  { id: 'sh', mode: 'phoneme', text: '/ʃ/', ipa: '如 ship 开头的 sh', phones: [['ʃ']], hint: '清晰地读 /ʃ/，不要在后面加元音。' },
  { id: 's', mode: 'phoneme', text: '/s/', ipa: '如 sun 开头的 s', phones: [['s']], hint: '可与 /ʃ/ 对照。清辅音也算有效输入，不需要声带振动。' },
  { id: 'ma1', mode: 'pinyin', text: 'mā', ipa: '第一声 · 妈', phones: [['m','a'],['m','ɑ']], hint: '自然读一声。下面的曲线只反映音高，不代表声调已经判对。' },
  { id: 'ma2', mode: 'pinyin', text: 'má', ipa: '第二声 · 麻', phones: [['m','a'],['m','ɑ']], hint: '试试与 mā 对照，观察音高变化；这一版不自动判声调。' },
  { id: 'ma3', mode: 'pinyin', text: 'mǎ', ipa: '第三声 · 马', phones: [['m','a'],['m','ɑ']], hint: '单独读 mǎ。第三声的实际变化不能只用一条固定曲线判断。' },
  { id: 'ma4', mode: 'pinyin', text: 'mà', ipa: '第四声 · 骂', phones: [['m','a'],['m','ɑ']], hint: '自然读四声，家长可结合回放与曲线进行标注。' },
];
