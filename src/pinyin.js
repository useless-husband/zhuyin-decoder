// 漢語拼音 <-> 注音，以及通用拼音輸出。
import { splitBase, parseSyllable, formatSyllable } from './bopomofo.js';

const INIT_PY = {
  b: 'ㄅ', p: 'ㄆ', m: 'ㄇ', f: 'ㄈ', d: 'ㄉ', t: 'ㄊ', n: 'ㄋ', l: 'ㄌ',
  g: 'ㄍ', k: 'ㄎ', h: 'ㄏ', j: 'ㄐ', q: 'ㄑ', x: 'ㄒ',
  zh: 'ㄓ', ch: 'ㄔ', sh: 'ㄕ', r: 'ㄖ', z: 'ㄗ', c: 'ㄘ', s: 'ㄙ',
};

// 韻母（已把 y/w 還原成 i/u/ü 開頭的寫法，iou/uei/uen 也收錄）
const FINAL_PY = {
  a: 'ㄚ', o: 'ㄛ', e: 'ㄜ', 'ê': 'ㄝ', eh: 'ㄝ',
  ai: 'ㄞ', ei: 'ㄟ', ao: 'ㄠ', ou: 'ㄡ', an: 'ㄢ', en: 'ㄣ', ang: 'ㄤ', eng: 'ㄥ', er: 'ㄦ',
  i: 'ㄧ', ia: 'ㄧㄚ', io: 'ㄧㄛ', ie: 'ㄧㄝ', iai: 'ㄧㄞ', iao: 'ㄧㄠ',
  iu: 'ㄧㄡ', iou: 'ㄧㄡ', ian: 'ㄧㄢ', in: 'ㄧㄣ', iang: 'ㄧㄤ', ing: 'ㄧㄥ', iong: 'ㄩㄥ',
  u: 'ㄨ', ua: 'ㄨㄚ', uo: 'ㄨㄛ', uai: 'ㄨㄞ', ui: 'ㄨㄟ', uei: 'ㄨㄟ',
  uan: 'ㄨㄢ', un: 'ㄨㄣ', uen: 'ㄨㄣ', uang: 'ㄨㄤ', ong: 'ㄨㄥ', ueng: 'ㄨㄥ',
  'ü': 'ㄩ', 'üe': 'ㄩㄝ', 'üan': 'ㄩㄢ', 'ün': 'ㄩㄣ',
};

const TONE_COMBINING = { 1: '\u0304', 2: '\u0301', 3: '\u030C', 4: '\u0300' };
const COMBINING_TONE = { '\u0304': 1, '\u0301': 2, '\u030C': 3, '\u0300': 4 };

/**
 * 拼音 -> {base, tone}。
 * 接受 "ni3"、"nǐ"、"lu:e4"、"lüe4"、"lve4"、"Zhong1"；失敗回傳 null。
 * 沒有聲調時視為一聲（呼叫者要嚴格檢查請自己先驗證）。
 */
export function pinyinToZhuyin(input) {
  let s = String(input).trim().toLowerCase().normalize('NFD');
  let tone = 0;
  s = s.replace(/[\u0300\u0301\u0304\u030C]/g, (m) => { tone = COMBINING_TONE[m]; return ''; });
  s = s.normalize('NFC').replace(/u:/g, 'ü').replace(/v/g, 'ü');
  const m = /^([a-zêü]+?)([1-5])?$/.exec(s);
  if (!m) return null;
  s = m[1];
  if (m[2]) tone = Number(m[2]);
  if (!tone) tone = 1;

  let initial = '';
  let fin;
  if (s[0] === 'y' && s.length > 1) {
    const rest = s.slice(1);
    if (rest[0] === 'i') fin = rest;
    else if (rest[0] === 'u' || rest[0] === 'ü') fin = 'ü' + rest.slice(1);
    else fin = 'i' + rest;
  } else if (s[0] === 'w' && s.length > 1) {
    const rest = s.slice(1);
    fin = rest[0] === 'u' ? rest : 'u' + rest;
  } else {
    const two = s.slice(0, 2);
    if (INIT_PY[two] && two.length === 2) initial = two;
    else if (INIT_PY[s[0]] && s.length > 1) initial = s[0];
    fin = s.slice(initial.length);
    if ('jqx'.includes(initial) && initial && fin[0] === 'u') fin = 'ü' + fin.slice(1);
    if (initial && 'zh ch sh r z c s'.split(' ').includes(initial) && fin === 'i') {
      return { base: INIT_PY[initial], tone };
    }
  }
  const z = FINAL_PY[fin];
  if (!z) return null;
  return { base: (initial ? INIT_PY[initial] : '') + z, tone };
}

// 標準漢語拼音音節表（不含聲調）。用來判斷「這串注音是不是合法音節」。
const SYLLABLE_TABLE = {
  '': 'a o e ê ai ei ao ou an en ang eng er yi ya yo ye yai yao you yan yin yang ying wu wa wo wai wei wan wen wang weng yu yue yuan yun yong',
  b: 'a o ai ei ao an en ang eng i ie iao ian in ing u',
  p: 'a o ai ei ao ou an en ang eng i ie iao ian in ing u',
  m: 'a o e ai ei ao ou an en ang eng i ie iao iu ian in ing u',
  f: 'a o ei ou an en ang eng u',
  d: 'a e ai ei ao ou an en ang eng ong i ia ie iao iu ian ing u uo ui uan un',
  t: 'a e ai ao ou an ang eng ong i ie iao ian ing u uo ui uan un',
  n: 'a e ai ei ao ou an en ang eng ong i ie iao iu ian in iang ing u uo uan ü üe',
  l: 'a o e ai ei ao ou an ang eng ong i ia ie iao iu ian in iang ing u uo uan un ü üe üan ün',
  g: 'a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang',
  k: 'a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang',
  h: 'a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang',
  j: 'i ia ie iao iu ian in iang ing iong u ue uan un',
  q: 'i ia ie iao iu ian in iang ing iong u ue uan un',
  x: 'i ia ie iao iu ian in iang ing iong u ue uan un',
  zh: 'i a e ai ei ao ou an en ang eng ong u ua uo uai ui uan un uang',
  ch: 'i a e ai ao ou an en ang eng ong u ua uo uai ui uan un uang',
  sh: 'i a e ai ei ao ou an en ang eng u ua uo uai ui uan un uang',
  r: 'i e ao ou an en ang eng ong u uo ui uan un',
  z: 'i a e ai ei ao ou an en ang eng ong u uo ui uan un',
  c: 'i a e ai ao ou an en ang eng ong u uo ui uan un',
  s: 'i a e ai ao ou an en ang eng ong u uo ui uan un',
};

export const VALID_BASES = new Set();
for (const [init, list] of Object.entries(SYLLABLE_TABLE)) {
  for (const f of list.split(' ')) {
    const r = pinyinToZhuyin(init + f);
    if (r) VALID_BASES.add(r.base);
  }
}

// ---------- 注音 -> 拼音 ----------

const EMPTY_RHYME = 'ㄓㄔㄕㄖㄗㄘㄙ';

const HY_INIT = {
  ㄅ: 'b', ㄆ: 'p', ㄇ: 'm', ㄈ: 'f', ㄉ: 'd', ㄊ: 't', ㄋ: 'n', ㄌ: 'l',
  ㄍ: 'g', ㄎ: 'k', ㄏ: 'h', ㄐ: 'j', ㄑ: 'q', ㄒ: 'x',
  ㄓ: 'zh', ㄔ: 'ch', ㄕ: 'sh', ㄖ: 'r', ㄗ: 'z', ㄘ: 'c', ㄙ: 's',
};
const TP_INIT = { ...HY_INIT, ㄐ: 'j', ㄑ: 'c', ㄒ: 's', ㄓ: 'jh' };

const HY_NOINIT = {
  ㄚ: 'a', ㄛ: 'o', ㄜ: 'e', ㄝ: 'ê', ㄞ: 'ai', ㄟ: 'ei', ㄠ: 'ao', ㄡ: 'ou',
  ㄢ: 'an', ㄣ: 'en', ㄤ: 'ang', ㄥ: 'eng', ㄦ: 'er',
  ㄧ: 'yi', ㄧㄚ: 'ya', ㄧㄛ: 'yo', ㄧㄝ: 'ye', ㄧㄞ: 'yai', ㄧㄠ: 'yao', ㄧㄡ: 'you',
  ㄧㄢ: 'yan', ㄧㄣ: 'yin', ㄧㄤ: 'yang', ㄧㄥ: 'ying',
  ㄨ: 'wu', ㄨㄚ: 'wa', ㄨㄛ: 'wo', ㄨㄞ: 'wai', ㄨㄟ: 'wei', ㄨㄢ: 'wan',
  ㄨㄣ: 'wen', ㄨㄤ: 'wang', ㄨㄥ: 'weng',
  ㄩ: 'yu', ㄩㄝ: 'yue', ㄩㄢ: 'yuan', ㄩㄣ: 'yun', ㄩㄥ: 'yong',
};
const HY_FINAL = {
  ㄚ: 'a', ㄛ: 'o', ㄜ: 'e', ㄝ: 'e', ㄞ: 'ai', ㄟ: 'ei', ㄠ: 'ao', ㄡ: 'ou',
  ㄢ: 'an', ㄣ: 'en', ㄤ: 'ang', ㄥ: 'eng', ㄦ: 'er',
  ㄧ: 'i', ㄧㄚ: 'ia', ㄧㄛ: 'io', ㄧㄝ: 'ie', ㄧㄞ: 'iai', ㄧㄠ: 'iao', ㄧㄡ: 'iu',
  ㄧㄢ: 'ian', ㄧㄣ: 'in', ㄧㄤ: 'iang', ㄧㄥ: 'ing',
  ㄨ: 'u', ㄨㄚ: 'ua', ㄨㄛ: 'uo', ㄨㄞ: 'uai', ㄨㄟ: 'ui', ㄨㄢ: 'uan',
  ㄨㄣ: 'un', ㄨㄤ: 'uang', ㄨㄥ: 'ong',
  ㄩ: 'ü', ㄩㄝ: 'üe', ㄩㄢ: 'üan', ㄩㄣ: 'ün', ㄩㄥ: 'iong',
};

const TP_NOINIT = { ...HY_NOINIT, ㄝ: 'eh', ㄨㄥ: 'wong', ㄨㄣ: 'wun' };
const TP_FINAL = {
  ...HY_FINAL, ㄝ: 'eh', ㄧㄡ: 'iou', ㄨㄟ: 'uei',
  ㄩ: 'yu', ㄩㄝ: 'yue', ㄩㄢ: 'yuan', ㄩㄣ: 'yun', ㄩㄥ: 'yong',
};

/** 不含聲調的拼音；不合法的注音回傳 null。scheme: 'hanyu' | 'tongyong' */
export function baseToPinyin(base, scheme = 'hanyu') {
  const p = splitBase(base);
  if (!p) return null;
  const tp = scheme === 'tongyong';
  const rest = p.medial + p.final;
  if (!p.initial) return (tp ? TP_NOINIT : HY_NOINIT)[rest] ?? null;
  const ini = (tp ? TP_INIT : HY_INIT)[p.initial];
  if (!rest) {
    return EMPTY_RHYME.includes(p.initial) ? ini + (tp ? 'ih' : 'i') : null;
  }
  let fin = (tp ? TP_FINAL : HY_FINAL)[rest];
  if (!fin) return null;
  if (!tp && 'ㄐㄑㄒ'.includes(p.initial)) fin = fin.replace('ü', 'u');
  return ini + fin;
}

function addMark(py, tone) {
  const vowels = 'aeiouüê';
  let idx = py.indexOf('a');
  if (idx < 0) idx = py.search(/[eê]/);
  if (idx < 0) idx = py.indexOf('ou') >= 0 ? py.indexOf('o') : -1;
  if (idx < 0) {
    for (let i = py.length - 1; i >= 0; i--) if (vowels.includes(py[i])) { idx = i; break; }
  }
  if (idx < 0) return py;
  return (py.slice(0, idx + 1) + TONE_COMBINING[tone] + py.slice(idx + 1)).normalize('NFC');
}

/**
 * 注音音節（字串或 {base,tone}）-> 拼音。
 * scheme: 'hanyu'（nǐ）| 'hanyu-num'（ni3）| 'tongyong'（nǐ）| 'tongyong-num'
 * 不合法的音節原樣回傳。
 */
export function zhuyinToPinyin(syllable, scheme = 'hanyu') {
  const { base, tone } = typeof syllable === 'string' ? parseSyllable(syllable) : syllable;
  const sys = scheme.startsWith('tongyong') ? 'tongyong' : 'hanyu';
  const py = baseToPinyin(base, sys);
  if (py == null) return formatSyllable(base, tone);
  if (scheme.endsWith('-num')) return py + tone;
  return tone === 5 ? py : addMark(py, tone);
}
