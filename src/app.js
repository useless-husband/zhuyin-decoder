// 畫面邏輯：讀取輸入、呼叫轉換函式、畫出結果。
import { parseDict, segText } from './dict.js';
import { decodeKeys, encodeText, renderEncoded, piecesToChinese, PINYIN_SCHEMES } from './convert.js';
import { EXAMPLES } from './examples.js';
import { formatSyllable } from './bopomofo.js';
import { zhuyinToPinyin } from './pinyin.js';

const $ = (sel) => document.querySelector(sel);
const q = $('#q');
const out = $('#out');
const statusEl = $('#status');

const state = {
  mode: 'k', // k：亂碼 -> 中文；c：中文 -> 亂碼
  scheme: 'hanyu',
  digits: true,
  dict: null,
  dec: null,
  enc: null,
  open: null, // { kind:'seg', pi, si } | { kind:'ch', pi }
  focusId: null,
};

function h(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) node.append(kid);
  return node;
}

// ---------- 網址參數 ----------

function readUrl() {
  const p = new URLSearchParams(location.search);
  if (p.get('m') === 'c') state.mode = 'c';
  if (PINYIN_SCHEMES.some(([id]) => id === p.get('p'))) state.scheme = p.get('p');
  if (p.get('d') === '0') state.digits = false;
  q.value = p.get('q') ?? '';
}

function writeUrl() {
  const p = new URLSearchParams();
  if (q.value) p.set('q', q.value);
  if (state.mode === 'c') p.set('m', 'c');
  if (state.scheme !== 'hanyu') p.set('p', state.scheme);
  if (!state.digits) p.set('d', '0');
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

let urlTimer = 0;
const writeUrlSoon = () => { clearTimeout(urlTimer); urlTimer = setTimeout(writeUrl, 250); };

// ---------- 複製 ----------

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('textarea', { 'aria-hidden': 'true' });
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.append(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* 沒辦法就算了 */ }
    ta.remove();
    btn?.focus();
  }
  if (btn) {
    const old = btn.dataset.label ?? btn.textContent;
    btn.dataset.label = old;
    btn.textContent = '已複製';
    setTimeout(() => { btn.textContent = old; }, 1500);
  }
  $('#copy-note').textContent = '已複製到剪貼簿';
}

const copyBtn = (getText) => h('button', { type: 'button', class: 'btn', text: '複製', onclick: (e) => copyText(getText(), e.currentTarget) });

// ---------- 計算 ----------

function compute() {
  const text = q.value;
  state.open = null;
  if (state.mode === 'k') {
    state.dec = decodeKeys(text, { dict: state.dict, scheme: state.scheme, digitsLiteral: state.digits });
    state.enc = null;
  } else {
    state.enc = state.dict ? encodeText(text, state.dict, { scheme: state.scheme }) : null;
    state.dec = null;
  }
}

// ---------- 畫面元件 ----------

function section(title, bodyNodes, { copy, extra } = {}) {
  return h('section', { class: 'result' },
    h('div', { class: 'result-head' },
      h('h2', { text: title }),
      h('div', { class: 'head-right' }, extra, copy ? copyBtn(copy) : null)),
    bodyNodes);
}

/** 把 token 串成一行，壞掉的片段標紅 */
function tokenLine(tokens, mapSyl, mono = false) {
  const line = h('p', { class: mono ? 'line mono' : 'line' });
  let prevSyl = false;
  for (const t of tokens) {
    if (t.type === 'syl') {
      line.append((prevSyl ? ' ' : '') + mapSyl(t));
      prevSyl = true;
    } else {
      prevSyl = false;
      if (t.type === 'bad') line.append(h('span', { class: 'bad', title: '無法組成注音', text: t.text }));
      else line.append(t.text);
    }
  }
  return line;
}

function schemeSelect() {
  return h('select', {
    'aria-label': '拼音格式',
    onchange: (e) => {
      state.scheme = e.target.value;
      if (state.enc) Object.assign(state.enc, renderEncoded(state.enc.pieces, state.scheme));
      if (state.dec) compute();
      writeUrl();
      render('scheme');
    },
  }, PINYIN_SCHEMES.map(([id, label]) => h('option', { value: id, text: label, selected: id === state.scheme })));
}

function candPanel(title, items, onPick) {
  const list = h('div', { class: 'cand-list', role: 'group', 'aria-label': title });
  items.forEach((it, i) => {
    list.append(h('button', {
      type: 'button', class: 'cand', 'aria-pressed': String(it.selected),
      onclick: () => onPick(i),
      onkeydown: (e) => {
        const btns = [...list.children];
        const at = btns.indexOf(e.currentTarget);
        if (e.key === 'ArrowRight') { btns[Math.min(at + 1, btns.length - 1)].focus(); e.preventDefault(); }
        if (e.key === 'ArrowLeft') { btns[Math.max(at - 1, 0)].focus(); e.preventDefault(); }
      },
    }, it.label, it.sub ? h('small', { text: it.sub }) : null));
  });
  return h('div', { class: 'cands' }, h('p', { class: 'cands-title', text: title }), list);
}

function closePanel(focusId) {
  state.open = null;
  state.focusId = focusId ?? null;
  render('panel');
}

// ---------- 亂碼 -> 中文 ----------

function renderKeysMode() {
  const { dec } = state;
  const frag = [];

  // 中文
  const zhLine = h('div', { class: 'zh-line' });
  dec.pieces.forEach((p, pi) => {
    if (p.type === 'raw') { zhLine.append(h('span', { class: 'raw-text', text: p.text })); return; }
    if (p.type === 'bad') { zhLine.append(h('span', { class: 'raw-text bad', title: '無法組成注音', text: p.text })); return; }
    if (!p.segs.length) { zhLine.append(h('span', { class: 'raw-text', text: '…' })); return; }
    p.segs.forEach((seg, si) => {
      const id = `seg-${pi}-${si}`;
      const word = segText(seg);
      const zy = seg.syls.map((s) => formatSyllable(s.base, s.tone)).join(' ');
      const many = seg.cands.length > 1;
      const isOpen = state.open?.kind === 'seg' && state.open.pi === pi && state.open.si === si;
      zhLine.append(h('button', {
        type: 'button',
        class: ['seg', many ? 'multi' : 'plain', seg.approx ? 'approx' : '', seg.cands.length ? '' : 'unknown'].join(' ').trim(),
        'data-id': id,
        'aria-expanded': many ? String(isOpen) : false,
        'aria-label': `${word}，注音 ${zy}${many ? '，按下可選擇其他候選' : ''}`,
        
        title: seg.approx ? '聲調沒有完全對上，這是忽略聲調找到的字' : (seg.cands.length ? '' : '詞典裡找不到這個音節'),
        onclick: () => {
          if (!many) return;
          state.open = isOpen ? null : { kind: 'seg', pi, si };
          state.focusId = id;
          render('panel');
        },
      }, h('span', { class: 'w', text: word }), h('span', { class: 'z', text: zy })));
    });
  });
  const body = [zhLine];
  const o = state.open;
  if (o?.kind === 'seg') {
    const seg = dec.pieces[o.pi].segs[o.si];
    body.push(candPanel(
      `「${zhuyinOf(seg)}」的候選（共 ${seg.cands.length} 個）`,
      seg.cands.slice(0, 80).map((c, i) => ({ label: c.w, selected: i === seg.sel })),
      (i) => { seg.sel = i; closePanel(`seg-${o.pi}-${o.si}`); },
    ));
  }
  if (!state.dict) body.push(h('p', { class: 'note', text: '詞典還在載入，先顯示注音與拼音。' }));
  frag.push(section('中文', body, { copy: () => piecesToChinese(dec.pieces) }));

  // 注音
  const zyBody = [tokenLine(dec.tokens, (t) => t.text)];
  if (dec.badCount) {
    zyBody.push(h('p', { class: 'note' },
      `有 ${dec.badCount} 段（`, h('span', { class: 'bad', text: '紅色波浪底線' }),
      '）無法組成合法音節，可能是打錯，或本來就不是亂碼。'));
  }
  frag.push(section('注音', zyBody, { copy: () => dec.zhuyin }));

  // 拼音
  frag.push(section('拼音', [tokenLine(dec.tokens, (t) => zhuyinToPinyin(t, state.scheme))], { copy: () => dec.pinyin, extra: schemeSelect() }));
  return frag;
}

const zhuyinOf = (seg) => seg.syls.map((s) => formatSyllable(s.base, s.tone)).join(' ');

// ---------- 中文 -> 亂碼 ----------

function renderChineseMode() {
  const { enc } = state;
  if (!enc) return [h('p', { class: 'note', text: '詞典載入中…' })];
  const frag = [];

  const keysBody = [
    h('p', { class: 'line mono', text: enc.keys }),
    h('p', { class: 'note', text: '空白鍵代表一聲，7 是輕聲。' }),
  ];
  frag.push(section('鍵位（大千鍵盤）', keysBody, { copy: () => enc.keys }));

  const zhLine = h('div', { class: 'zh-line' });
  enc.pieces.forEach((p, pi) => {
    if (p.type === 'raw') { zhLine.append(h('span', { class: 'raw-text', text: p.text })); return; }
    const s = p.alts[p.sel];
    const zy = formatSyllable(s.base, s.tone);
    const many = p.alts.length > 1;
    const id = `ch-${pi}`;
    const isOpen = state.open?.kind === 'ch' && state.open.pi === pi;
    zhLine.append(h('button', {
      type: 'button', class: many ? 'seg multi' : 'seg plain', 'data-id': id,
      'aria-expanded': many ? String(isOpen) : false,
      'aria-label': `${p.ch}，注音 ${zy}${many ? '，這個字有多種讀音，按下可切換' : ''}`,
      onclick: () => {
        if (!many) return;
        state.open = isOpen ? null : { kind: 'ch', pi };
        state.focusId = id;
        render('panel');
      },
    }, h('span', { class: 'w', text: p.ch }), h('span', { class: 'z', text: zy })));
  });
  const zyBody = [zhLine];
  if (state.open?.kind === 'ch') {
    const o = state.open;
    const p = enc.pieces[o.pi];
    zyBody.push(candPanel(
      `「${p.ch}」的讀音`,
      p.alts.map((a, i) => ({ label: formatSyllable(a.base, a.tone), sub: zhuyinToPinyin(a, state.scheme), selected: i === p.sel })),
      (i) => {
        p.sel = i;
        Object.assign(enc, renderEncoded(enc.pieces, state.scheme));
        closePanel(`ch-${o.pi}`);
      },
    ));
  }
  zyBody.push(h('p', { class: 'note', text: '多音字取最常見的讀音；有虛線底線的字可以點選切換。' }));
  frag.push(section('注音', zyBody, { copy: () => enc.zhuyin }));
  frag.push(section('拼音', [h('p', { class: 'line', text: enc.pinyin })], { copy: () => enc.pinyin, extra: schemeSelect() }));
  return frag;
}

// ---------- 主 render ----------

function helpBlock() {
  return h('section', { class: 'result help' },
    h('h2', { text: '怎麼用' }),
    state.mode === 'k'
      ? h('ol', {},
        h('li', { text: '把打錯的亂碼貼到上面的框，結果會即時出現。' }),
        h('li', { text: '空白鍵是一聲；3 是三聲、4 是四聲、6 是二聲、7 是輕聲。' }),
        h('li', { text: '點結果裡的詞可以換成別的候選字。' }))
      : h('ol', {},
        h('li', { text: '輸入中文，會算出用大千注音鍵盤要按哪些鍵。' }),
        h('li', { text: '多音字取最常見的讀音，點字可以改。' }),
        h('li', { text: '空白鍵代表一聲，7 是輕聲。' })));
}

function render(reason) {
  const scrollY = window.scrollY;
  out.replaceChildren();
  if (!q.value.trim()) {
    out.append(helpBlock());
  } else if (state.mode === 'k') {
    out.append(...renderKeysMode());
  } else {
    out.append(...renderChineseMode());
  }
  if (state.focusId) {
    out.querySelector(`[data-id="${state.focusId}"]`)?.focus({ preventScroll: true });
    state.focusId = null;
  }
  if (reason === 'panel' || reason === 'scheme') window.scrollTo(0, scrollY);
}

function refreshStatic() {
  const k = state.mode === 'k';
  $('#q-label').textContent = k ? '貼上亂碼' : '輸入中文';
  q.placeholder = k ? '例如：su3cl3' : '例如：你好';
  for (const r of document.querySelectorAll('input[name="mode"]')) r.checked = r.value === state.mode;
  $('#digits').checked = state.digits;
  $('#digits').closest('label').hidden = !k;
  renderExamples();
}

function renderExamples() {
  const box = $('#examples');
  box.replaceChildren();
  for (const zh of EXAMPLES) {
    let value = zh;
    let label = zh;
    if (state.mode === 'k') {
      if (!state.dict) continue;
      value = encodeText(zh, state.dict).keys;
      label = value.trimEnd();
    }
    box.append(h('button', {
      type: 'button', class: 'chip', 'aria-label': `範例：${label}`, title: state.mode === 'k' ? zh : '',
      onclick: () => { q.value = value; update(); q.focus(); },
      text: label,
    }));
  }
}

function update() {
  compute();
  render();
  writeUrlSoon();
}

// ---------- 事件 ----------

q.addEventListener('input', update);
$('#digits').addEventListener('change', (e) => { state.digits = e.target.checked; writeUrl(); update(); });
$('#clear').addEventListener('click', () => { q.value = ''; update(); writeUrl(); q.focus(); });
$('#share').addEventListener('click', (e) => { writeUrl(); copyText(location.href, e.currentTarget); });
for (const r of document.querySelectorAll('input[name="mode"]')) {
  r.addEventListener('change', () => {
    if (!r.checked || r.value === state.mode) return;
    // 切換方向時，把目前的結果帶進輸入框，方便來回檢查
    if (q.value.trim()) {
      if (state.mode === 'k' && state.dec) q.value = piecesToChinese(state.dec.pieces);
      else if (state.mode === 'c' && state.enc) q.value = state.enc.keys;
    }
    state.mode = r.value;
    refreshStatic();
    update();
    writeUrl();
  });
}
out.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.open) {
    const o = state.open;
    closePanel(o.kind === 'seg' ? `seg-${o.pi}-${o.si}` : `ch-${o.pi}`);
  }
});

// ---------- 啟動 ----------

readUrl();
refreshStatic();
update();

(async function loadDict() {
  statusEl.textContent = '詞典載入中…';
  try {
    const res = await fetch(new URL('../data/dict.txt', import.meta.url));
    if (!res.ok) throw new Error(String(res.status));
    state.dict = parseDict(await res.text());
    statusEl.textContent = `詞典已載入（${state.dict.words.size.toLocaleString('zh-TW')} 個詞）`;
  } catch {
    statusEl.textContent = '詞典載入失敗：仍可看注音與拼音。若是直接用檔案開啟，請改用本機伺服器（見 README）。';
    return;
  }
  refreshStatic();
  update();
})();
