import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCedict, parseFreq, buildDict, serialize, adjustForTaiwan } from '../scripts/build-dict.mjs';
import { parseDict } from '../src/dict.js';

const CEDICT = [
  '# comment',
  '你好 你好 [ni3 hao3] /hello/',
  '好 好 [hao3] /good/',
  '好 好 [hao4] /to be fond of/',
  '你 你 [ni3] /you/',
  '銀行 银行 [yin2 hang2] /bank/',
  '行 行 [xing2] /to walk/',
  '行 行 [hang2] /row/',
  '臺灣 台湾 [Tai2 wan1] /Taiwan/',
  '垃圾 垃圾 [la1 ji1] /trash (Taiwan pr. [le4 se4])/',
  '女 女 [nu:3] /female/',
  'A股 A股 [A5 gu3] /A-share/',
  '壞詞 坏词 [huai4] /bad entry, length mismatch/',
].join('\r\n');

const FREQ = ['你好 500 l', '你 5000 r', '好 4000 a', '銀行 300 n', '行 900 n', '臺灣 900 ns', '垃圾 200 n', '女 800 n'].join('\n');

test('parseCedict：略過註解、含英文字母與音節數不符的詞條', () => {
  const es = parseCedict(CEDICT);
  const words = es.map((e) => e.word);
  assert.ok(words.includes('你好'));
  assert.ok(!words.includes('A股'));
  assert.ok(!words.includes('壞詞'));
});

test('parseCedict：拼音轉成注音；Taiwan pr. 優先', () => {
  const es = parseCedict(CEDICT);
  assert.deepEqual(es.find((e) => e.word === '你好').syls, ['ㄋㄧˇ', 'ㄏㄠˇ']);
  assert.deepEqual(es.find((e) => e.word === '女').syls, ['ㄋㄩˇ']);
  assert.deepEqual(es.find((e) => e.word === '垃圾').syls, ['ㄌㄜˋ', 'ㄙㄜˋ']);
  assert.equal(es.find((e) => e.word === '臺灣').proper, true);
});

test('buildDict + serialize + parseDict：整條流程', () => {
  const map = buildDict(parseCedict(CEDICT), parseFreq(FREQ), { minFreq: 100 });
  const text = serialize(map, ['# test']);
  const d = parseDict(text);
  assert.equal(d.byKey.get('ㄋㄧˇ ㄏㄠˇ')[0].w, '你好');
  assert.equal(d.byKey.get('ㄧㄣˊ ㄏㄤˊ')[0].w, '銀行');
  // 多音字：行 的主要讀音應該是 ㄒㄧㄥˊ（詞頻統計 + 銀行 拉高 ㄏㄤˊ 但仍以 xing2 為第一個 CEDICT 讀音之一）
  assert.ok(d.chars.get('行').length === 2);
  // 「好」兩種讀音都要保留，ㄏㄠˇ 權重較高
  const hao = d.chars.get('好');
  assert.equal(hao[0].key, 'ㄏㄠˇ');
});

test('buildDict：詞頻低於門檻的多字詞被丟掉，單字全部保留', () => {
  const map = buildDict(parseCedict(CEDICT), parseFreq(FREQ), { minFreq: 400 });
  const d = parseDict(serialize(map, []));
  assert.ok(!d.byKey.has('ㄧㄣˊ ㄏㄤˊ'));
  assert.ok(d.byKey.has('ㄋㄧˇ'));
});

test('adjustForTaiwan：臺 -> 台 並列、裏 -> 裡', () => {
  const m = adjustForTaiwan(new Map([
    ['ㄊㄞˊ ㄨㄢ', new Map([['臺灣', 30]])],
    ['ㄋㄚˇ ㄌㄧˇ', new Map([['哪裏', 20]])],
  ]));
  const tw = m.get('ㄊㄞˊ ㄨㄢ');
  assert.equal(tw.get('臺灣'), 30);
  assert.equal(tw.get('台灣'), 31);
  assert.ok(m.get('ㄋㄚˇ ㄌㄧˇ').has('哪裡'));
  assert.ok(!m.get('ㄋㄚˇ ㄌㄧˇ').has('哪裏'));
});
