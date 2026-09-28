import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keysToTokens, syllableToKeys } from '../src/keyboard.js';
import { KEY_TO_BOPOMOFO, BOPOMOFO_TO_KEY, INITIALS, MEDIALS, FINALS } from '../src/bopomofo.js';
import { VALID_BASES } from '../src/pinyin.js';

const zy = (input, opts) =>
  keysToTokens(input, opts).map((t) => (t.type === 'syl' ? t.text : `[${t.type}:${t.text}]`)).join(' ');

test('su3cl3 -> ㄋㄧˇ ㄏㄠˇ', () => {
  assert.equal(zy('su3cl3'), 'ㄋㄧˇ ㄏㄠˇ');
});

test('大寫（Caps Lock）與小寫結果相同', () => {
  assert.equal(zy('SU3CL3'), zy('su3cl3'));
  assert.equal(zy('Su3Cl3'), 'ㄋㄧˇ ㄏㄠˇ');
});

test('空白鍵是一聲：su cl3 -> ㄋㄧ ㄏㄠˇ', () => {
  assert.equal(zy('su cl3'), 'ㄋㄧ ㄏㄠˇ');
});

test('句尾沒有聲調鍵視為一聲', () => {
  assert.equal(zy('w8'), 'ㄊㄚ');
});

test('四個聲調鍵：6 = ˊ、3 = ˇ、4 = ˋ、7 = ˙', () => {
  assert.equal(zy('su6'), 'ㄋㄧˊ');
  assert.equal(zy('su3'), 'ㄋㄧˇ');
  assert.equal(zy('su4'), 'ㄋㄧˋ');
  assert.equal(zy('a87'), 'ㄇㄚ˙'.replace('ㄇㄚ˙', '˙ㄇㄚ'));
});

test('輕聲可以放在音節前面：7a8', () => {
  assert.equal(zy('7a8'), '˙ㄇㄚ');
  assert.equal(zy('7a8su3'), '˙ㄇㄚ ㄋㄧˇ');
});

test('ㄦ（-鍵）：兒 -6、二 -4', () => {
  assert.equal(zy('-6'), 'ㄦˊ');
  assert.equal(zy('-4'), 'ㄦˋ');
});

test('單韻母可單獨成音節：ㄚ ㄛ ㄜ ㄝ ㄞ ㄟ ㄠ ㄡ ㄢ ㄣ ㄤ ㄥ', () => {
  assert.equal(zy('8 ', { digitsLiteral: false }), 'ㄚ');
  assert.equal(zy('u8 '), 'ㄧㄚ');
  assert.equal(zy('i4'), 'ㄛˋ');
  assert.equal(zy('k6'), 'ㄜˊ');
  assert.equal(zy(',4'), 'ㄝˋ');
  assert.equal(zy('94', { digitsLiteral: false }), 'ㄞˋ');
  assert.equal(zy('o3'), 'ㄟˇ');
  assert.equal(zy('l3'), 'ㄠˇ');
  assert.equal(zy('.6'), 'ㄡˊ');
  assert.equal(zy('04', { digitsLiteral: false }), 'ㄢˋ');
  assert.equal(zy('p '), 'ㄣ');
  assert.equal(zy(';3'), 'ㄤˇ');
  assert.equal(zy('/6'), 'ㄥˊ');
});

test('空韻：ㄓㄔㄕㄖㄗㄘㄙ 單獨成音節', () => {
  assert.equal(zy('5 ', { digitsLiteral: false }), 'ㄓ');
  assert.equal(zy('t6'), 'ㄔˊ');
  assert.equal(zy('g4'), 'ㄕˋ');
  assert.equal(zy('b4'), 'ㄖˋ');
  assert.equal(zy('y3'), 'ㄗˇ');
  assert.equal(zy('h6'), 'ㄘˊ');
  assert.equal(zy('n '), 'ㄙ');
});

test('介音與複合韻母：ㄨㄛˇ ㄒㄧㄝˋ ㄒㄩㄢˊ ㄓㄨㄤ', () => {
  assert.equal(zy('ji3'), 'ㄨㄛˇ');
  assert.equal(zy('vu,4'), 'ㄒㄧㄝˋ');
  assert.equal(zy('vm06'), 'ㄒㄩㄢˊ');
  assert.equal(zy('5j; '), 'ㄓㄨㄤ');
});

test('連續多個音節：我愛你 = ji394su3', () => {
  assert.equal(zy('ji394su3'), 'ㄨㄛˇ ㄞˋ ㄋㄧˇ');
});

test('標點與空白原樣保留', () => {
  assert.equal(zy('su3, cl3!'), 'ㄋㄧˇ [raw:, ] ㄏㄠˇ [raw:!]');
  assert.equal(zy('su3\ncl3'), 'ㄋㄧˇ [raw:\n] ㄏㄠˇ');
});

test('中文與亂碼混在一起，中文原樣保留', () => {
  assert.equal(zy('我說su3cl3'), '[raw:我說] ㄋㄧˇ ㄏㄠˇ');
});

test('組不成合法音節的片段標示為 bad', () => {
  assert.equal(zy('xsu3'), '[bad:x] ㄋㄧˇ');
  assert.equal(zy('qq3'), '[bad:qq3]');
});

test('缺聲調鍵又緊接其他按鍵：不硬切', () => {
  // "su" 後面直接接 "cl"，沒有聲調也沒有空白，視為亂碼片段
  const t = keysToTokens('sucl3');
  assert.ok(t.some((x) => x.type === 'bad'));
});

test('單獨的標點鍵不會被當成注音', () => {
  assert.equal(zy(','), '[raw:,]');
  assert.equal(zy('a, q'), '[bad:a] [raw:, ] [bad:q]');
  assert.equal(zy('...'), '[raw:...]');
});

test('純數字與數字格式預設原樣保留，可關閉', () => {
  assert.equal(zy('2024'), '[raw:2024]');
  assert.equal(zy('3.14'), '[raw:3.14]');
  assert.equal(zy('2024-09-29'), '[raw:2024-09-29]');
  assert.notEqual(zy('20', { digitsLiteral: false }), '[raw:20]');
});

test('緊接在音節後面的 5 仍是注音：u 後接 5 -> ㄓ', () => {
  assert.equal(zy('u 5 '), 'ㄧ ㄓ');
});

test('非法音節不成立：ㄖㄚ、ㄅ 單獨', () => {
  assert.ok(!VALID_BASES.has('ㄖㄚ'));
  assert.ok(!VALID_BASES.has('ㄅ'));
  assert.ok(VALID_BASES.has('ㄉㄧㄚ'));
  assert.ok(VALID_BASES.has('ㄩㄥ'));
  assert.ok(VALID_BASES.has('ㄓ'));
});

test('鍵盤對照：37 個注音符號每個都剛好一個鍵，且可反查', () => {
  assert.equal(Object.keys(KEY_TO_BOPOMOFO).length, 37);
  assert.equal([...INITIALS + MEDIALS + FINALS].length, 37);
  for (const ch of INITIALS + MEDIALS + FINALS) {
    assert.ok(BOPOMOFO_TO_KEY[ch], ch);
    assert.equal(KEY_TO_BOPOMOFO[BOPOMOFO_TO_KEY[ch]], ch);
  }
});

test('syllableToKeys：聲調鍵與一聲空白', () => {
  assert.equal(syllableToKeys('ㄋㄧ', 3), 'su3');
  assert.equal(syllableToKeys('ㄇㄚ', 1), 'a8 ');
  assert.equal(syllableToKeys('ㄇㄚ', 5), 'a87');
  assert.equal(syllableToKeys('ㄒㄧㄝ', 4), 'vu,4');
  assert.equal(syllableToKeys('ㄦ', 2), '-6');
});

test('所有合法音節 x 五個聲調：轉成鍵位再切回來一定一樣', () => {
  for (const base of VALID_BASES) {
    for (let tone = 1; tone <= 5; tone++) {
      const keys = syllableToKeys(base, tone);
      // 標點鍵組成的一聲會被視為標點，這是刻意的設計
      if (tone === 1 && /^[,./;-]+ $/.test(keys)) continue;
      const toks = keysToTokens(keys + 'zz', { digitsLiteral: false });
      const first = toks[0];
      assert.equal(first.type, 'syl', `${base} ${tone} ${JSON.stringify(keys)}`);
      assert.equal(first.base, base);
      assert.equal(first.tone, tone);
    }
  }
});
