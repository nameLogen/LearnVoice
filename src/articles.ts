export interface ReadingArticle { id: string; title: string; text: string; completed: string[] }
export interface ReadingSentence { id: string; text: string }
export interface ReadingParagraph { id: string; sentences: ReadingSentence[] }
export const ARTICLE_LIMIT = 30_000;
const KEY = 'voice-lab-articles-v1';
export const starterArticle: ReadingArticle = {
  id: 'a-little-adventure', title: 'A Little Adventure', completed: [],
  text: 'The sun is up. A little cat sits by the window. Today is a good day for an adventure!\n\nThe cat finds a red cap and a map. “Where shall we go?” asks the cat. A sheep waves from the hill.\n\nThey walk to the river and see a small ship. The cat smiles. A new friend makes every adventure better.',
};

export function articleParts(text: string): ReadingParagraph[] {
  return text.replace(/\r\n?/g, '\n').split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean).map((paragraph, p) => {
    const segments = typeof Intl.Segmenter === 'function'
      ? [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(paragraph)].map(s => s.segment)
      : paragraph.match(/[^.!?]+[.!?]*["”']?\s*/g) ?? [paragraph];
    // Bound each listening/recording turn; an unusually long sentence becomes short phrases.
    const chunks = segments.flatMap(s => {
      const words = s.trim().split(/\s+/); const out: string[] = []; let current = '';
      for (let i = 0, count = 0; i < words.length; i++) {
        if (current && (count >= 18 || current.length + words[i].length > 300)) { out.push(current); current = ''; count = 0; }
        current += (current ? ' ' : '') + words[i]; count++;
        // Also bound pasted strings without spaces for the speech engine.
        while (current.length > 300) { out.push(current.slice(0, 300)); current = current.slice(300); }
      }
      if (current) out.push(current); return out;
    });
    return { id: `p${p}`, sentences: chunks.map((text, s) => ({ id: `p${p}s${s}`, text })) };
  });
}

export function wordPieces(text: string): { text: string; word: boolean }[] {
  return text.split(/([A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*)/g).filter(Boolean)
    .map(text => ({ text, word: /^[A-Za-z]/.test(text) }));
}

export function validateArticle(title: string, text: string): void {
  if (!title.trim() || title.length > 100) throw new Error('请填写 1–100 字的标题。');
  if (!text.trim()) throw new Error('请粘贴文章内容。');
  if (text.length > ARTICLE_LIMIT) throw new Error('每篇最多 30,000 个字符，请分成几篇导入。');
  if (!/[a-z]/i.test(text)) throw new Error('这一版支持英语文章，请加入英文内容。');
}

export function decodeLibrary(raw: string): ReadingArticle[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > 20) throw new Error('文章数据格式不正确，最多保存 20 篇。');
  const ids = new Set<string>();
  return value.map(item => {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id) || typeof item.title !== 'string' || typeof item.text !== 'string') throw new Error('文章数据格式不正确。');
    validateArticle(item.title, item.text); ids.add(item.id);
    const valid = new Set(articleParts(item.text).flatMap(p => p.sentences.map(s => s.id)));
    return { id: item.id, title: item.title, text: item.text, completed: Array.isArray(item.completed) ? [...new Set<string>(item.completed.filter((s: unknown) => typeof s === 'string' && valid.has(s)))] : [] };
  });
}
export function loadArticles(): ReadingArticle[] {
  const raw = localStorage.getItem(KEY); return raw === null ? [{ ...starterArticle, completed: [] }] : decodeLibrary(raw);
}
export function saveArticles(articles: ReadingArticle[]): void { localStorage.setItem(KEY, JSON.stringify(articles)); }
