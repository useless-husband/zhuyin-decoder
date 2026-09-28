#!/usr/bin/env node
// 把 CC-CEDICT（讀音）與 jieba 繁體詞頻（排序）預處理成 data/dict.txt。
// 用法： node scripts/build-dict.mjs --cedict cedict_ts.u8 --freq dict.txt.big [--out data/dict.txt] [--min-freq 30]
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { pinyinToZhuyin } from '../src/pinyin.js';
import { formatSyllable } from '../src/bopomofo.js';

// 台灣常用讀音（多音字的主要讀音；其餘多音字用詞頻統計決定）
export const PRIMARY_READINGS = {
  的: 'de5', 了: 'le5', 行: 'xing2', 長: 'chang2', 中: 'zhong1', 重: 'zhong4', 得: 'de2',
  還: 'hai2', 都: 'dou1', 會: 'hui4', 樂: 'le4', 著: 'zhe5', 地: 'di4',
  乾: 'gan1', 覺: 'jue2', 好: 'hao3', 大: 'da4', 給: 'gei3', 什: 'shen2', 麼: 'me5',
  沒: 'mei2', 不: 'bu4', 和: 'he2', 教: 'jiao1', 假: 'jia3', 只: 'zhi3', 種: 'zhong3',
  便: 'bian4', 差: 'cha4', 傳: 'chuan2', 調: 'diao4', 應: 'ying1', 將: 'jiang1',
  更: 'geng4', 數: 'shu4', 幾: 'ji3', 分: 'fen1', 相: 'xiang1', 說: 'shuo1', 看: 'kan4',
  難: 'nan2', 過: 'guo4', 從: 'cong2', 少: 'shao3', 背: 'bei4', 量: 'liang4', 朝: 'chao2',
  處: 'chu4', 空: 'kong1', 藏: 'cang2', 血: 'xue4', 角: 'jiao3', 落: 'luo4', 弄: 'nong4',
  曲: 'qu3', 參: 'can1', 那: 'na4', 哪: 'na3', 他: 'ta1', 啊: 'a5', 嗎: 'ma5', 吧: 'ba5',
  呢: 'ne5', 嘛: 'ma5', 系: 'xi4', 們: 'men5', 子: 'zi3', 頭: 'tou2', 個: 'ge4', 車: 'che1',
  期: 'qi1', 石: 'shi2', 降: 'jiang4', 率: 'lu:4', 提: 'ti2', 發: 'fa1', 都: 'dou1',
  當: 'dang1', 卡: 'ka3', 咖: 'ka1', 拉: 'la1', 累: 'lei4', 蓋: 'gai4', 切: 'qie1',
  倒: 'dao4', 轉: 'zhuan3', 縣: 'xian4', 供: 'gong1', 稱: 'cheng1', 盛: 'sheng4',
};

// jieba 對少數常用字的單字詞頻偏低，手動給下限（數值是相對詞頻）
export const FREQ_FLOOR = { 為: 40000, 麵: 4000, 掉: 6000, 壞: 5000, 們: 20000, 難: 30000, 餓: 4000, 圓: 3000, 借: 5000, 店: 15000, 交: 15000 };

const ZHUYIN_OF = (py) => {
  if (!/^[a-zA-Zü:]+[1-5]$/.test(py)) return null;
  const r = pinyinToZhuyin(py);
  return r ? formatSyllable(r.base, r.tone) : null;
};

const level = (freq) => Math.max(1, Math.round(Math.log(freq + 1) * 4));

export function parseArgs(argv) {
  const a = { out: 'data/dict.txt', minFreq: 30 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cedict') a.cedict = argv[++i];
    else if (argv[i] === '--freq') a.freq = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--min-freq') a.minFreq = Number(argv[++i]);
  }
  return a;
}

/** 解析 CC-CEDICT，回傳 [{word, syls:[注音], proper, taiwan}] */
export function parseCedict(text) {
  const entries = [];
  const re = /^(\S+) (\S+) \[([^\]]+)\] \/(.*)\/$/;
  for (const line of text.split(/\r?\n/)) {
    if (!line || line[0] === '#') continue;
    const m = re.exec(line);
    if (!m) continue;
    const [, trad, , pinyin, gloss] = m;
    const chars = [...trad];
    if (!chars.every((c) => /\p{Script=Han}/u.test(c))) continue;
    const pick = (pys) => {
      const zs = pys.trim().split(/\s+/).map(ZHUYIN_OF);
      return zs.length === chars.length && zs.every(Boolean) ? zs : null;
    };
    // 台灣讀音優先：gloss 裡的 "Taiwan pr. [xxx]"
    const tw = /Taiwan pr\. \[([^\]]+)\]/.exec(gloss);
    let syls = tw ? pick(tw[1]) : null;
    const taiwan = Boolean(syls);
    if (!syls) syls = pick(pinyin);
    if (!syls) continue;
    const proper = /[A-Z]/.test(pinyin);
    const variant = /^(old |ancient )?variant of|^erhua variant|^see /.test(gloss.replace(/^\(.*?\)\s*/, ''));
    entries.push({ word: trad, syls, proper, taiwan, variant });
  }
  return entries;
}

export function parseFreq(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const [w, f] = line.split(' ');
    const n = Number(f);
    if (w && n >= 0 && (!map.has(w) || map.get(w) < n)) map.set(w, n);
  }
  return map;
}

export function buildDict(entries, freq, { minFreq = 30 } = {}) {
  // 1. 依詞頻統計每個字的各讀音權重
  const readingScore = new Map(); // char -> Map(reading -> score)
  for (const e of entries) {
    if (e.variant) continue;
    const chars = [...e.word];
    if (chars.length < 2) continue;
    const f = freq.get(e.word) ?? 0;
    if (!f) continue;
    chars.forEach((c, i) => {
      const m = readingScore.get(c) ?? new Map();
      m.set(e.syls[i], (m.get(e.syls[i]) ?? 0) + f);
      readingScore.set(c, m);
    });
  }
  const primary = new Map();
  for (const [ch, py] of Object.entries(PRIMARY_READINGS)) primary.set(ch, ZHUYIN_OF(py));

  // 2. 收集單字與詞
  const keyMap = new Map(); // key -> Map(word -> level)
  const put = (key, word, lv) => {
    const m = keyMap.get(key) ?? new Map();
    if (!m.has(word) || m.get(word) < lv) m.set(word, lv);
    keyMap.set(key, m);
  };

  const singles = new Map(); // char -> Set(reading)（只收非專有名詞、非異體）
  const singlesAny = new Map();
  const multi = new Map(); // word -> [readings]
  for (const e of entries) {
    const chars = [...e.word];
    if (chars.length === 1) {
      const target = e.proper || e.variant ? singlesAny : singles;
      const set = target.get(e.word) ?? new Set();
      set.add(e.syls[0]);
      target.set(e.word, set);
    } else {
      const list = multi.get(e.word) ?? [];
      const key = e.syls.join(' ');
      if (e.taiwan) list.unshift(key); else list.push(key);
      multi.set(e.word, list);
    }
  }
  for (const [ch, set] of singles) {
    const scores = readingScore.get(ch) ?? new Map();
    // jieba 裡單字的詞頻常常偏低（字多半出現在詞裡），所以也參考含有該字的詞
    const inWords = [...scores.values()].reduce((a, b) => a + b, 0);
    const f = Math.max(freq.get(ch) ?? 0, Math.round(inWords * 0.4), FREQ_FLOOR[ch] ?? 0);
    const readings = [...set];
    const p = primary.get(ch);
    const total = readings.reduce((a, r) => a + (scores.get(r) ?? 0) + 1, 0);
    for (const r of readings) {
      let share = ((scores.get(r) ?? 0) + 1) / total;
      if ((scores.get(r) ?? 0) > 0) share = Math.max(share, 0.3); // 確實有在用的讀音不要被壓太低
      if (p) share = r === p ? 0.9 : 0.1 / Math.max(1, readings.length - 1);
      put(r, ch, level(Math.max(f, 1) * share));
    }
    if (p && !set.has(p)) put(p, ch, level(Math.max(f, 1) * 0.9));
  }
  // 只有專有名詞讀法的單字（例如某些姓氏）也保留，但排在最後
  for (const [ch, set] of singlesAny) {
    if (singles.has(ch)) continue;
    for (const r of set) put(r, ch, 1);
  }
  for (const [word, keys] of multi) {
    const f = freq.get(word) ?? 0;
    if (f < minFreq) continue;
    keys.forEach((key, idx) => put(key, word, level(f * (idx === 0 ? 1 : 0.15))));
  }
  return adjustForTaiwan(keyMap);
}

// 台灣用字習慣的微調：
//  - 「裏」寫成「裡」（合併兩者，取較高權重）
//  - 有「臺」的詞另外加上「台」的寫法，並略高於原詞（打字時多半打「台」）
//  - 簡體專用字「万」降權，避免蓋過「末」「沒」等字
export function adjustForTaiwan(keyMap) {
  const out = new Map();
  const put = (key, word, lv) => {
    const m = out.get(key) ?? new Map();
    if (!m.has(word) || m.get(word) < lv) m.set(word, lv);
    out.set(key, m);
  };
  for (const [key, items] of keyMap) {
    for (const [word, lvRaw] of items) {
      let lv = lvRaw;
      if (word === '万') lv = Math.max(1, lv - 20);
      const w = word.replaceAll('裏', '裡');
      put(key, w, lv);
      if (w.includes('臺') && w !== '臺') put(key, w.replaceAll('臺', '台'), lv + 1);
      if (w === '臺') put(key, '台', lv + 1);
    }
  }
  return out;
}

export function serialize(keyMap, header) {
  const lines = [...header];
  const keys = [...keyMap.keys()].sort();
  for (const key of keys) {
    const items = [...keyMap.get(key)].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    lines.push(`${key}\t${items.map(([w, lv]) => `${w}=${lv}`).join(' ')}`);
  }
  return lines.join('\n') + '\n';
}

const HEADER = [
  '# 注音亂碼翻譯機 詞典資料（由 scripts/build-dict.mjs 產生，請勿手改）',
  '# 格式：注音音節（以空白分隔）<TAB> 詞=權重 詞=權重 ...（權重愈大愈常用）',
  '# 讀音與詞條來源：CC-CEDICT (https://cc-cedict.org/) — CC BY-SA 4.0',
  '# 詞頻來源：jieba extra_dict/dict.txt.big (https://github.com/fxsjy/jieba) — MIT License, Copyright (c) 2013 Sun Junyi',
  '# 本檔為上述資料的衍生作品，依 CC BY-SA 4.0 授權散布 (https://creativecommons.org/licenses/by-sa/4.0/)。',
];

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.cedict || !args.freq) {
    console.error('用法：node scripts/build-dict.mjs --cedict <cedict_ts.u8> --freq <dict.txt.big> [--out data/dict.txt] [--min-freq 30]');
    process.exit(2);
  }
  const entries = parseCedict(readFileSync(args.cedict, 'utf8'));
  const freq = parseFreq(readFileSync(args.freq, 'utf8'));
  const keyMap = buildDict(entries, freq, { minFreq: args.minFreq });
  const out = serialize(keyMap, HEADER);
  writeFileSync(args.out, out);
  const words = [...keyMap.values()].reduce((a, m) => a + m.size, 0);
  console.log(`寫入 ${args.out}：${keyMap.size} 個讀音、${words} 個詞條、${(out.length / 1024).toFixed(0)} KB（字元數）`);
}
