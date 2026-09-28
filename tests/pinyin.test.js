import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinyinToZhuyin, zhuyinToPinyin, baseToPinyin, VALID_BASES } from '../src/pinyin.js';
import { formatSyllable } from '../src/bopomofo.js';

const p2z = (s) => {
  const r = pinyinToZhuyin(s);
  return r && formatSyllable(r.base, r.tone);
};

test('拼音 -> 注音：基本聲母韻母', () => {
  assert.equal(p2z('ni3'), 'ㄋㄧˇ');
  assert.equal(p2z('hao3'), 'ㄏㄠˇ');
  assert.equal(p2z('zhong1'), 'ㄓㄨㄥ');
  assert.equal(p2z('shuang4'), 'ㄕㄨㄤˋ');
});

test('拼音 -> 注音：接受聲調符號與大小寫', () => {
  assert.equal(p2z('nǐ'), 'ㄋㄧˇ');
  assert.equal(p2z('Zhōng'), 'ㄓㄨㄥ');
  assert.equal(p2z('lǜ'), 'ㄌㄩˋ');
});

test('拼音 -> 注音：y / w 開頭還原成 i / u / ü', () => {
  assert.equal(p2z('yi1'), 'ㄧ');
  assert.equal(p2z('you3'), 'ㄧㄡˇ');
  assert.equal(p2z('yan2'), 'ㄧㄢˊ');
  assert.equal(p2z('wu3'), 'ㄨˇ');
  assert.equal(p2z('wei4'), 'ㄨㄟˋ');
  assert.equal(p2z('weng1'), 'ㄨㄥ');
  assert.equal(p2z('yong3'), 'ㄩㄥˇ');
  assert.equal(p2z('yue4'), 'ㄩㄝˋ');
});

test('拼音縮寫：iu = iou、ui = uei、un = uen', () => {
  assert.equal(p2z('liu2'), 'ㄌㄧㄡˊ');
  assert.equal(p2z('liou2'), 'ㄌㄧㄡˊ');
  assert.equal(p2z('dui4'), 'ㄉㄨㄟˋ');
  assert.equal(p2z('duei4'), 'ㄉㄨㄟˋ');
  assert.equal(p2z('gun3'), 'ㄍㄨㄣˇ');
  assert.equal(p2z('guen3'), 'ㄍㄨㄣˇ');
});

test('ü 規則：j q x 後的 u 其實是 ü；n l 要寫 ü（或 v、u:）', () => {
  assert.equal(p2z('ju3'), 'ㄐㄩˇ');
  assert.equal(p2z('xue2'), 'ㄒㄩㄝˊ');
  assert.equal(p2z('quan2'), 'ㄑㄩㄢˊ');
  assert.equal(p2z('yun2'), 'ㄩㄣˊ');
  assert.equal(p2z('nü3'), 'ㄋㄩˇ');
  assert.equal(p2z('nv3'), 'ㄋㄩˇ');
  assert.equal(p2z('nu:3'), 'ㄋㄩˇ');
  assert.equal(p2z('lu4'), 'ㄌㄨˋ');
  assert.equal(p2z('lüe4'), 'ㄌㄩㄝˋ');
});

test('空韻：zhi chi shi ri zi ci si 沒有韻母', () => {
  assert.equal(p2z('zhi1'), 'ㄓ');
  assert.equal(p2z('shi4'), 'ㄕˋ');
  assert.equal(p2z('ci2'), 'ㄘˊ');
  assert.equal(p2z('si'), 'ㄙ');
});

test('拼音 -> 注音：ㄦ、ㄝ、輕聲', () => {
  assert.equal(p2z('er2'), 'ㄦˊ');
  assert.equal(p2z('ê1'), 'ㄝ');
  assert.equal(p2z('ma5'), '˙ㄇㄚ');
  assert.equal(p2z('zzz3'), null);
});

test('注音 -> 漢語拼音（聲調符號）', () => {
  assert.equal(zhuyinToPinyin('ㄋㄧˇ'), 'nǐ');
  assert.equal(zhuyinToPinyin('ㄏㄠˇ'), 'hǎo');
  assert.equal(zhuyinToPinyin('ㄓㄨㄥ'), 'zhōng');
  assert.equal(zhuyinToPinyin('ㄇㄚ˙'), 'ma');
  assert.equal(zhuyinToPinyin('˙ㄇㄚ'), 'ma');
});

test('注音 -> 漢語拼音（數字聲調）', () => {
  assert.equal(zhuyinToPinyin('ㄋㄧˇ', 'hanyu-num'), 'ni3');
  assert.equal(zhuyinToPinyin('ㄇㄚ', 'hanyu-num'), 'ma1');
  assert.equal(zhuyinToPinyin('˙ㄇㄚ', 'hanyu-num'), 'ma5');
});

test('聲調符號標在正確的母音：a > e > o；iu、ui 標在後面', () => {
  assert.equal(zhuyinToPinyin('ㄏㄠˇ'), 'hǎo');
  assert.equal(zhuyinToPinyin('ㄌㄧㄡˊ'), 'liú');
  assert.equal(zhuyinToPinyin('ㄉㄨㄟˋ'), 'duì');
  assert.equal(zhuyinToPinyin('ㄍㄨㄟˋ'), 'guì');
  assert.equal(zhuyinToPinyin('ㄡˇ'), 'ǒu');
  assert.equal(zhuyinToPinyin('ㄒㄩㄝˊ'), 'xué');
  assert.equal(zhuyinToPinyin('ㄦˊ'), 'ér');
});

test('注音 -> 拼音：iou/uei/uen 縮寫', () => {
  assert.equal(zhuyinToPinyin('ㄌㄧㄡˊ', 'hanyu-num'), 'liu2');
  assert.equal(zhuyinToPinyin('ㄉㄨㄟˋ', 'hanyu-num'), 'dui4');
  assert.equal(zhuyinToPinyin('ㄍㄨㄣˇ', 'hanyu-num'), 'gun3');
  assert.equal(zhuyinToPinyin('ㄧㄡˇ', 'hanyu-num'), 'you3');
  assert.equal(zhuyinToPinyin('ㄨㄟˋ', 'hanyu-num'), 'wei4');
  assert.equal(zhuyinToPinyin('ㄨㄣˊ', 'hanyu-num'), 'wen2');
});

test('注音 -> 拼音：ü 規則（nü lü 保留 ü，jqx 寫成 u）', () => {
  assert.equal(zhuyinToPinyin('ㄋㄩˇ'), 'nǚ');
  assert.equal(zhuyinToPinyin('ㄌㄩㄝˋ'), 'lüè');
  assert.equal(zhuyinToPinyin('ㄐㄩ'), 'jū');
  assert.equal(zhuyinToPinyin('ㄑㄩㄢˊ'), 'quán');
  assert.equal(zhuyinToPinyin('ㄒㄩㄣ', 'hanyu-num'), 'xun1');
  assert.equal(zhuyinToPinyin('ㄩㄝˋ', 'hanyu-num'), 'yue4');
  assert.equal(zhuyinToPinyin('ㄩㄥˇ', 'hanyu-num'), 'yong3');
  assert.equal(zhuyinToPinyin('ㄐㄩㄥ', 'hanyu-num'), 'jiong1');
});

test('注音 -> 拼音：零聲母 y / w 與空韻', () => {
  assert.equal(zhuyinToPinyin('ㄧ', 'hanyu-num'), 'yi1');
  assert.equal(zhuyinToPinyin('ㄧㄣ', 'hanyu-num'), 'yin1');
  assert.equal(zhuyinToPinyin('ㄨ', 'hanyu-num'), 'wu1');
  assert.equal(zhuyinToPinyin('ㄨㄥ', 'hanyu-num'), 'weng1');
  assert.equal(zhuyinToPinyin('ㄓ', 'hanyu-num'), 'zhi1');
  assert.equal(zhuyinToPinyin('ㄙˋ', 'hanyu-num'), 'si4');
});

test('通用拼音：jh、c(ㄑ)、s(ㄒ)、-ih、iou/uei、y 系列', () => {
  assert.equal(zhuyinToPinyin('ㄓ', 'tongyong-num'), 'jhih1');
  assert.equal(zhuyinToPinyin('ㄔˊ', 'tongyong-num'), 'chih2');
  assert.equal(zhuyinToPinyin('ㄑㄧ', 'tongyong-num'), 'ci1');
  assert.equal(zhuyinToPinyin('ㄒㄧㄠˇ', 'tongyong-num'), 'siao3');
  assert.equal(zhuyinToPinyin('ㄐㄩㄣ', 'tongyong-num'), 'jyun1');
  assert.equal(zhuyinToPinyin('ㄌㄧㄡˊ', 'tongyong-num'), 'liou2');
  assert.equal(zhuyinToPinyin('ㄉㄨㄟˋ', 'tongyong-num'), 'duei4');
  assert.equal(zhuyinToPinyin('ㄋㄧˇ', 'tongyong'), 'nǐ');
});

test('不合法的注音原樣回傳，不會丟例外', () => {
  assert.equal(zhuyinToPinyin('ㄅ'), 'ㄅ');
  assert.equal(baseToPinyin('abc'), null);
});

test('全部合法音節：注音 -> 漢語拼音 -> 注音 可完整往返', () => {
  assert.ok(VALID_BASES.size > 400);
  for (const base of VALID_BASES) {
    const py = baseToPinyin(base, 'hanyu');
    assert.ok(py, base);
    const back = pinyinToZhuyin(py + '1');
    assert.equal(back.base, base, `${base} -> ${py}`);
  }
});
