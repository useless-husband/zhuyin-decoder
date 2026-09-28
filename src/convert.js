// 把各模組串成畫面用的高階函式。
import { keysToTokens, syllableToKeys } from './keyboard.js';
import { zhuyinToPinyin } from './pinyin.js';
import { decodeTokens, segText, encodeChinese } from './dict.js';
import { formatSyllable } from './bopomofo.js';

export const PINYIN_SCHEMES = [
  ['hanyu', '漢語拼音（nǐ hǎo）'],
  ['hanyu-num', '漢語拼音・數字聲調（ni3 hao3）'],
  ['tongyong', '通用拼音（nǐ hǎo）'],
  ['tongyong-num', '通用拼音・數字聲調（ni3 hao3）'],
];

/** 依 token 串接文字；相鄰音節之間補一個空白 */
function joinTokens(tokens, mapSyl) {
  let out = '';
  let prevSyl = false;
  for (const t of tokens) {
    if (t.type === 'syl') {
      out += (prevSyl ? ' ' : '') + mapSyl(t);
      prevSyl = true;
    } else {
      out += t.text;
      prevSyl = false;
    }
  }
  return out;
}

/** 亂碼 -> 注音 / 拼音 / 中文片段 */
export function decodeKeys(input, { dict = null, scheme = 'hanyu', digitsLiteral = true } = {}) {
  const tokens = keysToTokens(input, { digitsLiteral });
  return {
    tokens,
    zhuyin: joinTokens(tokens, (t) => t.text),
    pinyin: joinTokens(tokens, (t) => zhuyinToPinyin(t, scheme)),
    pieces: decodeTokens(tokens, dict),
    badCount: tokens.filter((t) => t.type === 'bad').length,
  };
}

/** decodeKeys().pieces -> 中文字串 */
export function piecesToChinese(pieces) {
  return pieces
    .map((p) => (p.type === 'zh' ? p.segs.map(segText).join('') : p.text))
    .join('');
}

/** 中文 -> 逐字注音、拼音、大千鍵位 */
export function encodeText(text, dict, { scheme = 'hanyu' } = {}) {
  const pieces = encodeChinese(text, dict);
  return { pieces, ...renderEncoded(pieces, scheme) };
}

/** 依目前選到的讀音重新算出注音/拼音/鍵位（使用者切換多音字後呼叫） */
export function renderEncoded(pieces, scheme = 'hanyu') {
  let zhuyin = '';
  let pinyin = '';
  let keys = '';
  let prevZh = false;
  for (const p of pieces) {
    if (p.type === 'zh') {
      const s = p.alts[p.sel];
      zhuyin += (prevZh ? ' ' : '') + formatSyllable(s.base, s.tone);
      pinyin += (prevZh ? ' ' : '') + zhuyinToPinyin(s, scheme);
      keys += syllableToKeys(s.base, s.tone);
      prevZh = true;
    } else {
      zhuyin += p.text;
      pinyin += p.text;
      keys += p.text;
      prevZh = false;
    }
  }
  return { zhuyin, pinyin, keys };
}
