// 詞典載入、注音 -> 中文（最長詞匹配 + 詞頻排序）、中文 -> 注音
import { formatSyllable, parseSyllable } from './bopomofo.js';

/**
 * 解析 data/dict.txt。
 * 回傳：
 *  byKey  Map<'ㄋㄧˇ ㄏㄠˇ', [{w, lv}]>   某串注音對應的詞（已依權重排序）
 *  words  Map<'你好', [{key, lv}]>         某個詞的讀音（已依權重排序）
 *  chars  Map<'好', [{key, lv}]>           單字的所有讀音
 *  byBase Map<'ㄏㄠ', [{w, lv, key}]>      忽略聲調的單字（找不到精確聲調時備用）
 */
export function parseDict(text) {
  const byKey = new Map();
  const words = new Map();
  const chars = new Map();
  const byBase = new Map();
  const neutralIdx = new Map(); // 含輕聲的多字詞：忽略聲調的音節序列 -> [key]
  let maxLen = 1;
  for (const line of text.split(/\r?\n/)) {
    if (!line || line[0] === '#') continue;
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const key = line.slice(0, tab);
    const n = key.split(' ').length;
    if (n > maxLen) maxLen = n;
    const items = [];
    for (const item of line.slice(tab + 1).split(' ')) {
      const eq = item.lastIndexOf('=');
      items.push({ w: item.slice(0, eq), lv: Number(item.slice(eq + 1)) });
    }
    byKey.set(key, items);
    if (n > 1 && key.includes('˙')) {
      const seq = key.split(' ').map((x) => parseSyllable(x).base).join(' ');
      const list = neutralIdx.get(seq) ?? [];
      list.push(key);
      neutralIdx.set(seq, list);
    }
    for (const { w, lv } of items) {
      const list = words.get(w) ?? [];
      list.push({ key, lv });
      words.set(w, list);
      if (n === 1) {
        chars.set(w, list);
        const base = parseSyllable(key).base;
        const b = byBase.get(base) ?? [];
        b.push({ w, lv, key });
        byBase.set(base, b);
      }
    }
  }
  for (const list of words.values()) list.sort((a, b) => b.lv - a.lv);
  for (const list of byBase.values()) list.sort((a, b) => b.lv - a.lv);
  return { byKey, words, chars, byBase, neutralIdx, maxLen };
}

/**
 * 查某段音節的候選詞。除了聲調完全相符的詞，也接受「詞典裡是輕聲、使用者打了別的聲調」的詞
 * （例如 謝謝 = ㄒㄧㄝˋ ˙ㄒㄧㄝ，但大家常打成 ㄒㄧㄝˋ ㄒㄧㄝˋ），這類詞權重稍微調低。
 */
function lookup(dict, syls, keys, i, j) {
  const exact = dict.byKey.get(keys.slice(i, j).join(' '));
  if (j - i < 2 || !dict.neutralIdx.size) return exact;
  const rel = dict.neutralIdx.get(syls.slice(i, j).map((s) => s.base).join(' '));
  if (!rel) return exact;
  const merged = new Map((exact ?? []).map(({ w, lv }) => [w, lv]));
  for (const key of rel) {
    const ds = key.split(' ');
    if (!ds.every((d, k) => d === keys[i + k] || d.startsWith('˙'))) continue;
    for (const { w, lv } of dict.byKey.get(key)) {
      if (!merged.has(w) || merged.get(w) < lv - 2) merged.set(w, lv - 2);
    }
  }
  if (!merged.size) return exact;
  return [...merged].map(([w, lv]) => ({ w, lv })).sort((a, b) => b.lv - a.lv);
}

// 太冷僻的詞稍微加重成本，避免最長詞匹配挑到怪詞
const rarity = (lv) => (lv < 20 ? (20 - lv) * 0.03 : 0);

/**
 * 一串連續的注音音節 [{base, tone}] -> 分段結果。
 * 目標：分段數最少（等於最長詞匹配），同分時比較詞頻。
 * 回傳 [{start, end, cands:[{w,lv}], sel:0, approx, syls}]
 * cands 為空代表這個音節在詞典裡完全沒有字（會原樣顯示注音）。
 * approx 為 true 代表聲調沒對上，候選是忽略聲調找到的字。
 */
export function segment(syls, dict) {
  const n = syls.length;
  const keys = syls.map((s) => formatSyllable(s.base, s.tone));
  const best = new Array(n + 1).fill(null);
  best[0] = { cost: 0, score: 0, prev: -1, cands: null, approx: false };
  for (let j = 1; j <= n; j++) {
    for (let i = Math.max(0, j - dict.maxLen); i < j; i++) {
      if (!best[i]) continue;
      let cands = lookup(dict, syls, keys, i, j);
      let approx = false;
      let cost;
      let score;
      if (cands) {
        cost = 1 + rarity(cands[0].lv);
        score = cands[0].lv;
      } else if (j - i === 1) {
        const ap = dict.byBase.get(syls[i].base);
        approx = Boolean(ap);
        cands = ap ? ap.map(({ w, lv }) => ({ w, lv })) : [];
        cost = ap ? 6 : 20;
        score = 0;
      } else continue;
      const total = best[i].cost + cost;
      const sc = best[i].score + score;
      const cur = best[j];
      if (!cur || total < cur.cost - 1e-9 || (Math.abs(total - cur.cost) < 1e-9 && sc > cur.score)) {
        best[j] = { cost: total, score: sc, prev: i, cands, approx };
      }
    }
  }
  const segs = [];
  for (let j = n; j > 0; j = best[j].prev) {
    const b = best[j];
    segs.push({ start: b.prev, end: j, cands: b.cands, sel: 0, approx: b.approx, syls: syls.slice(b.prev, j) });
  }
  return segs.reverse();
}

/** 由 keysToTokens 的結果產生「片段」：中文區段（含分段候選）、原樣文字、無法辨識的按鍵 */
export function decodeTokens(tokens, dict) {
  const pieces = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const syls = run.map(({ base, tone }) => ({ base, tone }));
    pieces.push({ type: 'zh', syls, segs: dict ? segment(syls, dict) : [] });
    run = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'syl') { run.push(t); continue; }
    // 音節之間夾的純空白不打斷中文
    if (t.type === 'raw' && /^\s+$/.test(t.text) && run.length && tokens[i + 1]?.type === 'syl') continue;
    flush();
    pieces.push({ type: t.type, text: t.text });
  }
  flush();
  return pieces;
}

/** 分段結果目前選到的文字；沒有候選時回傳注音 */
export function segText(seg) {
  return seg.cands.length ? seg.cands[seg.sel].w : seg.syls.map((s) => formatSyllable(s.base, s.tone)).join(' ');
}

export const isHan = (ch) => /\p{Script=Han}/u.test(ch);

/**
 * 中文 -> 逐字注音。以最長詞匹配決定多音字在詞中的讀音，
 * 每個字附上所有可能讀音（alts），sel 為目前選用的那個。
 * 回傳 [{type:'zh', ch, alts:[{base,tone}], sel}] 與 [{type:'raw', text}]
 */
export function encodeChinese(text, dict) {
  const chars = [...String(text)];
  const out = [];
  let i = 0;
  while (i < chars.length) {
    if (!isHan(chars[i])) {
      const last = out[out.length - 1];
      if (last && last.type === 'raw') last.text += chars[i];
      else out.push({ type: 'raw', text: chars[i] });
      i++;
      continue;
    }
    let matched = 0;
    let key = null;
    for (let len = Math.min(dict.maxLen, chars.length - i); len >= 1; len--) {
      const w = chars.slice(i, i + len).join('');
      const rs = dict.words.get(w);
      if (rs && (len === 1 || chars.slice(i, i + len).every(isHan))) {
        matched = len; key = rs[0].key; break;
      }
    }
    if (!matched) {
      out.push({ type: 'raw', text: chars[i], unknown: true });
      i++;
      continue;
    }
    const sylKeys = key.split(' ');
    for (let k = 0; k < matched; k++) {
      const ch = chars[i + k];
      const def = sylKeys[k];
      const alts = [def];
      for (const r of dict.chars.get(ch) ?? []) if (!alts.includes(r.key)) alts.push(r.key);
      out.push({ type: 'zh', ch, alts: alts.map(parseSyllable), sel: 0 });
    }
    i += matched;
  }
  return out;
}
