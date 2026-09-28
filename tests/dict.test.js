import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDict, segment, segText } from '../src/dict.js';
import { decodeKeys, piecesToChinese, encodeText, renderEncoded } from '../src/convert.js';
import { EXAMPLES } from '../src/examples.js';

const dict = parseDict(readFileSync(new URL('../data/dict.txt', import.meta.url), 'utf8'));
const zh = (keys, opts = {}) => piecesToChinese(decodeKeys(keys, { dict, ...opts }).pieces);

test('詞典檔大小與內容合理（< 3MB、詞條數）', () => {
  const bytes = readFileSync(new URL('../data/dict.txt', import.meta.url)).length;
  assert.ok(bytes < 3 * 1024 * 1024, `${bytes}`);
  assert.ok(dict.byKey.size > 30000);
  assert.ok(dict.maxLen >= 4);
});

test('亂碼 -> 中文：su3cl3 = 你好', () => {
  assert.equal(zh('su3cl3'), '你好');
});

test('亂碼 -> 中文：整句', () => {
  assert.equal(zh('ji394su3'), '我愛你');
  assert.equal(zh('rup wu0 wu0 fu4cp3cl3'), '今天天氣很好');
  assert.equal(zh('vu,4vu,4'), '謝謝');
});

test('詞典是輕聲、使用者打別的聲調也找得到：謝謝、你們', () => {
  assert.equal(zh('vu,4vu,4'), '謝謝');
  assert.equal(zh('vu,4vu,7'), '謝謝');
  assert.equal(zh('su3ap6'), '你們');
});

test('最長詞匹配：ㄒㄧㄤˋ ㄍㄤ 之類的詞會優先整詞', () => {
  const r = decodeKeys('rup wu0', { dict });
  const zhPiece = r.pieces.find((p) => p.type === 'zh');
  assert.equal(zhPiece.segs.length, 1); // 「今天」一個詞，而不是「今」「天」兩段
  assert.equal(segText(zhPiece.segs[0]), '今天');
});

test('每一段都有候選清單，可切換選項', () => {
  const r = decodeKeys('su3', { dict });
  const seg = r.pieces[0].segs[0];
  assert.ok(seg.cands.length >= 3);
  assert.equal(segText(seg), '你');
  seg.sel = 1;
  assert.notEqual(segText(seg), '你');
  assert.equal(piecesToChinese(r.pieces), seg.cands[1].w);
});

test('候選依詞頻排序（權重由大到小）', () => {
  for (const key of ['ㄕˋ', 'ㄋㄧˇ ㄏㄠˇ', 'ㄨㄛˇ']) {
    const c = dict.byKey.get(key);
    for (let i = 1; i < c.length; i++) assert.ok(c[i - 1].lv >= c[i].lv);
  }
});

test('標點與空白保留，亂碼片段不吞掉', () => {
  assert.equal(zh('su3cl3, ji3!'), '你好, 我!');
  assert.equal(zh('xsu3'), 'x你');
  const r = decodeKeys('xsu3', { dict });
  assert.equal(r.badCount, 1);
});

test('聲調對不上時退而求其次：忽略聲調找字', () => {
  // ㄒㄩㄢ 一聲的「宣」存在；故意給一個不存在的組合
  const segs = segment([{ base: 'ㄋㄧ', tone: 5 }], dict);
  assert.equal(segs.length, 1);
  assert.ok(segs[0].approx || segs[0].cands.length > 0);
});

test('完全沒有對應字的音節：cands 為空，顯示注音', () => {
  const segs = segment([{ base: 'ㄇㄛ', tone: 4 }, { base: 'ㄉㄧㄚ', tone: 5 }], dict);
  assert.ok(segs.length >= 1);
  assert.ok(segs.every((s) => typeof segText(s) === 'string'));
});

test('中文 -> 鍵位：你好 = su3cl3', () => {
  const e = encodeText('你好', dict);
  assert.equal(e.keys, 'su3cl3');
  assert.equal(e.zhuyin, 'ㄋㄧˇ ㄏㄠˇ');
  assert.equal(e.pinyin, 'nǐ hǎo');
});

test('中文 -> 鍵位：一聲用空白、輕聲用 7', () => {
  assert.equal(encodeText('媽媽', dict).keys, 'a8 a87');
});

test('多音字依詞決定讀音：銀行 = ㄧㄣˊ ㄏㄤˊ，行走 = ㄒㄧㄥˊ', () => {
  assert.equal(encodeText('銀行', dict).zhuyin, 'ㄧㄣˊ ㄏㄤˊ');
  assert.equal(encodeText('行動', dict).zhuyin, 'ㄒㄧㄥˊ ㄉㄨㄥˋ');
});

test('多音字取最常見讀音：的、了、好', () => {
  assert.equal(encodeText('的', dict).zhuyin, '˙ㄉㄜ');
  assert.equal(encodeText('好', dict).zhuyin, 'ㄏㄠˇ');
});

test('多音字可切換讀音，鍵位與拼音跟著變', () => {
  const e = encodeText('行', dict);
  const p = e.pieces[0];
  assert.ok(p.alts.length >= 2);
  const before = e.keys;
  p.sel = p.alts.findIndex((a) => a.base === 'ㄏㄤ');
  assert.ok(p.sel > 0);
  const after = renderEncoded(e.pieces, 'hanyu-num');
  assert.notEqual(after.keys, before);
  assert.equal(after.pinyin, 'hang2');
});

test('中文 -> 鍵位：非中文原樣保留', () => {
  const e = encodeText('Hi，你好！ABC', dict);
  assert.equal(e.keys, 'Hi，su3cl3！ABC');
});

test('往返：範例按鈕的中文 -> 亂碼 -> 中文 大致一致', () => {
  for (const s of EXAMPLES) {
    const e = encodeText(s, dict);
    const back = zh(e.keys);
    assert.equal(back, s, `${s} -> ${e.keys} -> ${back}`);
  }
});

test('拼音輸出隨方案切換', () => {
  const r = decodeKeys('su3cl3', { dict, scheme: 'hanyu-num' });
  assert.equal(r.pinyin, 'ni3 hao3');
  assert.equal(decodeKeys('su3cl3', { scheme: 'tongyong-num' }).pinyin, 'ni3 hao3');
});

test('沒有載入詞典時仍可輸出注音與拼音', () => {
  const r = decodeKeys('su3cl3');
  assert.equal(r.zhuyin, 'ㄋㄧˇ ㄏㄠˇ');
  assert.deepEqual(r.pieces[0].segs, []);
});
