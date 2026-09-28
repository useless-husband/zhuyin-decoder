// 大千鍵盤亂碼 <-> 注音音節
import {
  KEY_TO_BOPOMOFO, BOPOMOFO_TO_KEY, TONE_KEYS, KEY_OF_TONE, formatSyllable,
} from './bopomofo.js';
import { VALID_BASES } from './pinyin.js';

const isKeyChar = (ch) => ch !== undefined && /[a-z0-9,./;-]/i.test(ch);

/** 嘗試從 s[i] 開始讀出一個注音音節；成功回傳 token，否則 null */
function trySyllable(s, i) {
  let j = i;
  let leadingNeutral = false;
  if (s[j] === '7') { leadingNeutral = true; j++; }
  const syms = [];
  for (let k = j; k < s.length && syms.length < 3; k++) {
    const b = KEY_TO_BOPOMOFO[s[k].toLowerCase()];
    if (!b) break;
    syms.push(b);
  }
  for (let n = syms.length; n >= 1; n--) {
    const base = syms.slice(0, n).join('');
    if (!VALID_BASES.has(base)) continue;
    const p = j + n;
    const next = s[p];
    let tone;
    let end = p;
    // 只由標點鍵（, . / ; -）組成、又沒有明確聲調鍵的片段，當作標點而不是注音
    const onlyPunct = /^[,./;-]+$/.test(s.slice(j, p));
    if (leadingNeutral) {
      tone = 5;
    } else if (onlyPunct && TONE_KEYS[next] === undefined) {
      continue;
    } else if (next === undefined) {
      tone = 1;
    } else if (next === ' ') {
      tone = 1; end = p + 1;
    } else if (TONE_KEYS[next] !== undefined) {
      tone = TONE_KEYS[next]; end = p + 1;
    } else if (!isKeyChar(next)) {
      tone = 1;
    } else {
      continue; // 後面緊接著別的按鍵：這個切法不成立
    }
    return { type: 'syl', base, tone, text: formatSyllable(base, tone), src: s.slice(i, end), end };
  }
  return null;
}

/**
 * 把使用者輸入依大千鍵盤切成 token：
 *  - { type:'syl', base, tone, text }  合法注音音節
 *  - { type:'bad', text }              看起來是按鍵、卻組不成合法音節
 *  - { type:'raw', text }              空白、標點、中文等，原樣保留
 * options.digitsLiteral（預設 true）：整段都是數字/標點組成的字（如 2024、3.14）當作一般數字。
 */
export function keysToTokens(input, { digitsLiteral = true } = {}) {
  const s = String(input);
  const out = [];
  const push = (type, text) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let sylEnd = -1; // 上一個音節結束的位置（緊接在音節後面的數字不算獨立數字）
  while (i < s.length) {
    const ch = s[i];
    const runStart = i === 0 || !isKeyChar(s[i - 1]);
    const glued = i === sylEnd; // 緊接在音節（含吃掉的空白）後面
    if (digitsLiteral && runStart && /[0-9]/.test(ch)) {
      const run = /^[a-z0-9,./;-]+/i.exec(s.slice(i))[0];
      // 像 2024、3.14、1,000、2024-09-29 這種「數字加分隔符」才當一般數字
      // 剛好接在音節後面的一兩個數字（例如「一之」= u 5 ）優先當注音
      const numeric = /^[0-9]+([.,/-][0-9]+)*$/.test(run) && !(glued && run.length < 3);
      if (numeric) { push('raw', run); i += run.length; continue; }
    }
    if (isKeyChar(ch)) {
      const t = trySyllable(s, i);
      if (t) {
        out.push({ type: 'syl', base: t.base, tone: t.tone, text: t.text, src: t.src });
        i = t.end;
        sylEnd = i;
        continue;
      }
      push(/[,./;-]/.test(ch) ? 'raw' : 'bad', ch);
      i++;
      continue;
    }
    push('raw', ch);
    i++;
  }
  return out;
}

/** 單一注音音節 -> 大千鍵位。 ㄋㄧˇ -> "su3"；一聲以空白結尾；輕聲以 7 結尾 */
export function syllableToKeys(base, tone) {
  let keys = '';
  for (const ch of base) keys += BOPOMOFO_TO_KEY[ch] ?? '';
  return keys + KEY_OF_TONE[tone];
}
