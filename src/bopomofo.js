// 注音符號的基本資料：聲母、介音、韻母、聲調，以及大千鍵盤對照。

export const INITIALS = 'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ';
export const MEDIALS = 'ㄧㄨㄩ';
export const FINALS = 'ㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ';

/** 聲調符號 -> 聲調數字（一聲不標，用 1；輕聲 = 5） */
export const TONE_OF_MARK = { 'ˊ': 2, 'ˇ': 3, 'ˋ': 4, '˙': 5 };
export const MARK_OF_TONE = { 1: '', 2: 'ˊ', 3: 'ˇ', 4: 'ˋ', 5: '˙' };

/** 標準大千（Daqian）鍵盤：按鍵 -> 注音符號 */
export const KEY_TO_BOPOMOFO = {
  '1': 'ㄅ', q: 'ㄆ', a: 'ㄇ', z: 'ㄈ',
  '2': 'ㄉ', w: 'ㄊ', s: 'ㄋ', x: 'ㄌ',
  e: 'ㄍ', d: 'ㄎ', c: 'ㄏ',
  r: 'ㄐ', f: 'ㄑ', v: 'ㄒ',
  '5': 'ㄓ', t: 'ㄔ', g: 'ㄕ', b: 'ㄖ',
  y: 'ㄗ', h: 'ㄘ', n: 'ㄙ',
  u: 'ㄧ', j: 'ㄨ', m: 'ㄩ',
  '8': 'ㄚ', i: 'ㄛ', k: 'ㄜ', ',': 'ㄝ',
  '9': 'ㄞ', o: 'ㄟ', l: 'ㄠ', '.': 'ㄡ',
  '0': 'ㄢ', p: 'ㄣ', ';': 'ㄤ', '/': 'ㄥ', '-': 'ㄦ',
};

/** 聲調鍵：3 = ˇ、4 = ˋ、6 = ˊ、7 = ˙；空白鍵 = 一聲 */
export const TONE_KEYS = { '3': 3, '4': 4, '6': 2, '7': 5 };
export const KEY_OF_TONE = { 1: ' ', 2: '6', 3: '3', 4: '4', 5: '7' };

export const BOPOMOFO_TO_KEY = Object.fromEntries(
  Object.entries(KEY_TO_BOPOMOFO).map(([k, v]) => [v, k]),
);

/** 把「不含聲調」的注音拆成 {initial, medial, final}；含非法符號回傳 null */
export function splitBase(base) {
  const out = { initial: '', medial: '', final: '' };
  let i = 0;
  if (base[i] && INITIALS.includes(base[i])) out.initial = base[i++];
  if (base[i] && MEDIALS.includes(base[i])) out.medial = base[i++];
  if (base[i] && FINALS.includes(base[i])) out.final = base[i++];
  return i === base.length && base.length > 0 ? out : null;
}

/** ('ㄋㄧ', 3) -> 'ㄋㄧˇ'；輕聲寫成 '˙ㄇㄚ' */
export function formatSyllable(base, tone) {
  if (tone === 5) return '˙' + base;
  return base + MARK_OF_TONE[tone];
}

/** 'ㄋㄧˇ' / '˙ㄇㄚ' / 'ㄇㄚ˙' -> {base, tone} */
export function parseSyllable(str) {
  let s = str;
  let tone = 1;
  if (s.startsWith('˙')) { tone = 5; s = s.slice(1); }
  const last = s[s.length - 1];
  if (last && TONE_OF_MARK[last]) { tone = TONE_OF_MARK[last]; s = s.slice(0, -1); }
  return { base: s, tone };
}
