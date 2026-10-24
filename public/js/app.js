// Carnival Manager (Cash Station) — SETUP / OPERATE / MANAGE.
// UI + flows. Pricing rules live in pricing.js, card rules in tickets.js, NFC in nfc.js.

import { createNfc } from './nfc.js';
import {
  MAX_COUNT, CARD_BYTES, addTickets, serializeCard, fingerprint, estimateBytes, parseTicketText,
} from './tickets.js';
import {
  formatMoney, quote, describeQuote, sellableItems, priceLine, draftToConfig, configToDraft, isConfigured, cleanName,
} from './pricing.js';
import { loadConfig, saveConfig, clearConfig, requestPersistence } from './store.js';
import { unlockAudio, success, failure, tick, setKeepAwake } from './feedback.js';

const APP_VERSION = '1.0.0'; // keep in step with VERSION in sw.js
const OK_RESULT_MS = 4000;
const LOCK_MS = 1200; // ignore re-reads right after a tap/write so one tap is never handled twice
const PENDING_MS = 60000;

const $screen = document.getElementById('screen');
const $bar = document.getElementById('bar');
const $dialog = document.getElementById('dialog');

let nfc;
let config = loadConfig();
let view = { screen: 'home' };
let cart = { qty: {}, card: null }; // card: null | 'new' | 'reload'
let draft = null;
let nfcState = { scanning: false, error: null };
let busy = false;
let lockUntil = 0;
let resultTimer = null;
let pendingWrite = null;
let installPrompt = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const shortName = (n) => (n.startsWith('GRILL:') ? n.slice(6) : n);
const NFC_SCREENS = ['cart', 'loadTap', 'manageWait', 'manageEdit', 'manageTap', 'result'];

/* ---------------------------------------------------------------- views */

function setView(next) {
  clearTimeout(resultTimer);
  view = next;
  if (view.screen === 'result' && view.kind === 'ok') resultTimer = setTimeout(() => actions.ok(), OK_RESULT_MS);
  render();
}

function notify(text, kind = 'error') {
  view = { ...view, notice: { text, kind } };
  if (kind === 'error') failure();
  render();
}

function showResult(kind, title, lines, back, from) {
  if (kind === 'ok') success(); else failure();
  setView({ screen: 'result', kind, title, lines, back, from });
}

function render() {
  const keep = $screen.scrollTop;
  renderBar();
  $screen.className = `s-${view.screen}`;
  $screen.innerHTML = screens[view.screen](view);
  $screen.scrollTop = keep;
  if (view.screen === 'cart') refreshCart();
  if (view.screen === 'manageEdit') refreshManage();
}

function barInfo() {
  switch (view.screen) {
    case 'setup': return { chip: 'SETUP', nfc: false, buttons: [['home', 'HOME']] };
    case 'cart': return { chip: 'OPERATE', nfc: true, buttons: [['manage', 'MANAGE'], ['home', 'HOME']] };
    case 'loadTap': return { chip: 'OPERATE', nfc: true, buttons: [] };
    case 'manageWait':
    case 'manageEdit': return { chip: 'MANAGE', nfc: true, buttons: [['operate', 'OPERATE']] };
    case 'manageTap': return { chip: 'MANAGE', nfc: true, buttons: [] };
    case 'result': return { chip: view.from === 'manage' ? 'MANAGE' : 'OPERATE', nfc: true, buttons: [] };
    default: return null;
  }
}

function renderBar() {
  const info = barInfo();
  $bar.hidden = !info;
  if (!info) return;
  const state = nfcState.scanning ? '<span class="dot on"></span>READY' : '<span class="dot"></span>NFC OFF';
  $bar.innerHTML = `
    <span class="chip chip-${info.chip}">${info.chip}</span>
    <span class="nfc-state">${info.nfc ? state : ''}</span>
    ${info.buttons.map(([act, label]) => `<button class="small" data-act="${act}">${label}</button>`).join('')}`;
}

const NFC_ICON = (pulse = true) => `
  <svg class="nfc-icon${pulse ? ' pulse' : ''}" viewBox="0 0 120 120" aria-hidden="true">
    <rect x="34" y="14" width="52" height="92" rx="10" fill="none" stroke="currentColor" stroke-width="6"/>
    <path d="M52 48a14 14 0 0 1 0 24M62 40a26 26 0 0 1 0 40M72 32a38 38 0 0 1 0 56" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
  </svg>`;

const noticeHtml = (v) => (v.notice ? `<div class="notice ${v.notice.kind}">${esc(v.notice.text)}</div>` : '');

function stepperHtml(scope, i, value) {
  return `
    <div class="stepper">
      <button class="step" data-act="step" data-scope="${scope}" data-i="${i}" data-d="-1" aria-label="Remove one">−</button>
      <input class="qty-input" id="q-${scope}-${i}" data-scope="${scope}" data-i="${i}" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${value}" aria-label="Amount">
      <button class="step" data-act="step" data-scope="${scope}" data-i="${i}" data-d="1" aria-label="Add one">+</button>
    </div>`;
}

function summaryLines(cfg) {
  const lines = sellableItems(cfg).map((it) => `${it.label}: ${priceLine(it)}`);
  if (cfg.buyIn) lines.push(`New card: ${formatMoney(cfg.buyIn)}`);
  return lines;
}

const screens = {
  home() {
    const ready = isConfigured(config);
    const status = ready
      ? `<div class="status ok"><b>EVENT IS SET UP</b>${config.eventName ? `<div class="evname">${esc(config.eventName)}</div>` : ''}
           ${summaryLines(config).map((l) => `<div>${esc(l)}</div>`).join('')}</div>`
      : '<div class="status warn"><b>NO EVENT SET UP YET</b><div>Press SETUP to enter your ticket prices.</div></div>';
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    return `
      <div class="picker">
        <h1>CARNIVAL MANAGER</h1>
        ${status}
        ${nfc && !nfc.supported ? '<div class="notice warn">This phone can’t use NFC here. SETUP works, but loading cards needs <b>Chrome on Android</b>.</div>' : ''}
        <button class="big mode-btn m-setup" data-act="setup">SETUP<small>Prices and ticket types</small></button>
        <button class="big mode-btn m-operate${ready ? '' : ' dim'}" data-act="operate">OPERATE<small>Sell tickets, load cards</small></button>
        <button class="big secondary" data-act="install">${standalone ? 'APP IS INSTALLED ✓' : 'INSTALL APP'}</button>
        <p class="version">v${APP_VERSION} · works offline</p>
      </div>`;
  },

  /* ---- SETUP ---- */
  setup(v) {
    const d = draft;
    const errors = v.errors?.length
      ? `<div class="notice error"><b>Please fix:</b><ul>${v.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : '';
    const grillRows = d.grill.map((g, i) => `
      <div class="grill-row">
        <input class="field" data-grill="name" data-i="${i}" value="${esc(g.name)}" placeholder="MEAL" autocapitalize="characters" autocomplete="off" aria-label="Item name">
        <label class="money"><span>$</span><input class="field" data-grill="price" data-i="${i}" value="${esc(g.price)}" placeholder="10.00" inputmode="decimal" autocomplete="off" aria-label="Price"></label>
        <button class="del" data-act="delGrill" data-i="${i}" aria-label="Remove item">✕</button>
      </div>`).join('');
    return `
      <div class="form">
        ${errors}
        <section>
          <h3>EVENT NAME <small>(optional)</small></h3>
          <input class="field" data-field="eventName" value="${esc(d.eventName)}" placeholder="Fall Carnival 2026" autocomplete="off">
        </section>
        <section>
          <h3>GAME TICKETS</h3>
          <label class="lbl">Price for one ticket
            <span class="money"><span>$</span><input class="field" data-field="gamePrice" value="${esc(d.gamePrice)}" placeholder="1.00" inputmode="decimal" autocomplete="off"></span>
          </label>
          <div class="two">
            <label class="lbl">Bundle size
              <input class="field" data-field="bundleQty" value="${esc(d.bundleQty)}" placeholder="20" inputmode="numeric" autocomplete="off">
            </label>
            <label class="lbl">Bundle price
              <span class="money"><span>$</span><input class="field" data-field="bundlePrice" value="${esc(d.bundlePrice)}" placeholder="10.00" inputmode="decimal" autocomplete="off"></span>
            </label>
          </div>
          <p class="hint">Example: 20 tickets for $10.00. Leave the bundle blank for none, or the single price blank to not sell GAME tickets.</p>
        </section>
        <section>
          <h3>GRILL TICKETS</h3>
          ${grillRows}
          <button class="big secondary" data-act="addGrill">+ ADD GRILL ITEM</button>
          <p class="hint">Each item becomes its own ticket type on the card, like GRILL:MEAL or GRILL:BEVERAGE.</p>
        </section>
        <section>
          <h3>NEW CARD OR BRACELET <small>(optional)</small></h3>
          <label class="lbl">Price of a new card
            <span class="money"><span>$</span><input class="field" data-field="buyIn" value="${esc(d.buyIn)}" placeholder="5.00" inputmode="decimal" autocomplete="off"></span>
          </label>
          <p class="hint">If set, OPERATE asks NEW CARD or RELOAD and adds this price only for a new card.</p>
        </section>
        <button class="big go" data-act="saveOperate">SAVE &amp; OPERATE</button>
        <button class="big primary" data-act="save">SAVE</button>
        ${config ? '<button class="big dangerous" data-act="clearEvent">ERASE EVENT SETUP</button>' : ''}
      </div>`;
  },

  /* ---- OPERATE ---- */
  cart(v) {
    const items = sellableItems(config);
    const rows = items.map((it, i) => `
      <div class="item">
        <div class="item-top">
          <div class="item-name">${esc(it.label)}<small>${esc(priceLine(it))}</small></div>
          <div class="line-total" id="lt-${i}"></div>
        </div>
        ${stepperHtml('cart', i, 0)}
        <div class="item-sub" id="sub-${i}"></div>
        ${it.bundleQty ? `<button class="small wide" data-act="addBundle" data-i="${i}">+${it.bundleQty} for ${formatMoney(it.bundlePrice)}</button>` : ''}
      </div>`).join('');
    const cardChoice = config.buyIn ? `
      <div class="seg">
        <button data-act="cardMode" data-v="new" id="seg-new">NEW CARD<small>+${formatMoney(config.buyIn)}</small></button>
        <button data-act="cardMode" data-v="reload" id="seg-reload">RELOAD<small>card they have</small></button>
      </div>` : '';
    return `
      <div class="stack cart">
        ${noticeHtml(v)}
        ${nfc && !nfc.supported ? '<div class="notice warn">NFC is not available on this phone. Use Chrome on Android.</div>' : ''}
        <div class="items">${rows}</div>
        <div class="footer">
          ${cardChoice}
          <div class="total-row"><span>TOTAL</span><b id="total">$0.00</b><button class="small" data-act="clear">CLEAR</button></div>
          <button class="big go" id="finalize" data-act="finalize" disabled>FINALIZE</button>
        </div>
      </div>`;
  },

  loadTap(v) {
    return `
      <div class="center">
        ${NFC_ICON()}
        <h1>TAP CARD TO LOAD</h1>
        <div class="loadlist">
          ${v.lines.map((l) => `<p class="line">${l.qty} × ${esc(l.label)}</p>`).join('')}
          ${v.isNew ? '<p class="line">NEW CARD</p>' : ''}
        </div>
        <p class="sub">Payment: ${formatMoney(v.total)}</p>
        ${noticeHtml(v)}
        ${nfcState.scanning ? '' : '<button class="big primary" data-act="read">READ CARD</button>'}
        <button class="big cancel" data-act="cancelLoad">CANCEL</button>
      </div>`;
  },

  result(v) {
    return `
      <div class="center result ${v.kind}">
        <h1>${esc(v.title)}</h1>
        ${v.lines.map((l) => `<p class="line">${esc(l)}</p>`).join('')}
        <button class="big primary" data-act="ok">OK</button>
      </div>`;
  },

  /* ---- MANAGE ---- */
  manageWait(v) {
    const err = nfcState.error ? `<div class="notice error">${esc(nfcState.error)}</div>` : '';
    return `
      <div class="center">
        ${NFC_ICON(nfcState.scanning)}
        <h1>${nfcState.scanning ? 'TAP CARD' : 'PRESS READ CARD'}</h1>
        <p class="sub">to see and change what is on it</p>
        ${noticeHtml(v)}${err}
        ${nfcState.scanning ? '' : '<button class="big primary" data-act="read">READ CARD</button>'}
      </div>`;
  },

  manageEdit(v) {
    const rows = v.rows.map((r, i) => `
      <div class="item">
        <div class="item-top"><div class="item-name">${esc(r.name)}</div></div>
        ${stepperHtml('row', i, r.count)}
      </div>`).join('');
    return `
      <div class="stack">
        <h2>ON THIS CARD <small>${esc(v.serial || '')}</small></h2>
        ${noticeHtml(v)}
        <div class="items">
          ${rows || '<p class="sub empty">This card has no tickets.</p>'}
          <button class="big secondary" data-act="addType">+ ADD TICKET TYPE</button>
          <p class="hint">Set an amount to 0 to remove it. Writing replaces everything that was on the card.</p>
        </div>
        <div class="footer">
          <button class="big go" id="write" data-act="writeCard" disabled>NO CHANGES</button>
          <button class="big cancel" data-act="cancelManage">CANCEL</button>
        </div>
      </div>`;
  },

  manageTap(v) {
    const lines = v.rows.filter((r) => r.count > 0).map((r) => `${r.count} × ${r.name}`);
    return `
      <div class="center">
        ${NFC_ICON()}
        <h1>TAP THE SAME CARD AGAIN</h1>
        <p class="sub">to write these amounts:</p>
        ${lines.length ? lines.map((l) => `<p class="line">${esc(l)}</p>`).join('') : '<p class="line">(empty card)</p>'}
        ${noticeHtml(v)}
        <button class="big cancel" data-act="cancelWrite">CANCEL</button>
      </div>`;
  },
};

/* ------------------------------------------------------------ live bits */

function cartLines() {
  return sellableItems(config).map((it, i) => ({ it, i, qty: cart.qty[it.key] || 0 }));
}

function cartTotal() {
  const goods = cartLines().reduce((sum, l) => sum + quote(l.qty, l.it).cost, 0);
  return goods + (cart.card === 'new' ? config.buyIn : 0);
}

/** Updates totals and counters in place, so typing in a quantity box is never interrupted. */
function refreshCart() {
  for (const { it, i, qty } of cartLines()) {
    const q = quote(qty, it);
    const input = document.getElementById(`q-cart-${i}`);
    if (input && document.activeElement !== input) input.value = qty;
    document.getElementById(`lt-${i}`).textContent = qty ? formatMoney(q.cost) : '';
    document.getElementById(`sub-${i}`).textContent = qty && it.bundleQty ? describeQuote(q) : '';
  }
  const total = cartTotal();
  const hasGoods = cartLines().some((l) => l.qty > 0);
  const needsChoice = config.buyIn > 0 && cart.card === null;
  document.getElementById('total').textContent = formatMoney(total);
  const fin = document.getElementById('finalize');
  fin.disabled = needsChoice || !(hasGoods || cart.card === 'new');
  fin.textContent = needsChoice ? 'CHOOSE NEW CARD OR RELOAD' : fin.disabled ? 'FINALIZE' : `FINALIZE ${formatMoney(total)}`;
  for (const v of ['new', 'reload']) document.getElementById(`seg-${v}`)?.classList.toggle('on', cart.card === v);
}

function rowsFingerprint(rows) {
  return fingerprint({ tickets: Object.fromEntries(rows.map((r) => [r.name, r.count])) });
}

function refreshManage() {
  view.rows.forEach((r, i) => {
    const input = document.getElementById(`q-row-${i}`);
    if (input && document.activeElement !== input) input.value = r.count;
  });
  const dirty = rowsFingerprint(view.rows) !== view.fp;
  const btn = document.getElementById('write');
  btn.disabled = !dirty;
  btn.textContent = dirty ? 'WRITE TO CARD' : 'NO CHANGES';
}

const isManageDirty = () => view.screen === 'manageEdit' && rowsFingerprint(view.rows) !== view.fp;
const isSetupDirty = () => view.screen === 'setup' && JSON.stringify(draft) !== view.initial;

/* -------------------------------------------------------------- card I/O */

class WriteFailed extends Error {}

/** Write `next` to the card that was just read. Remembers the attempt so a retry can't double-apply. */
async function writeCard(tag, next, onApplied) {
  const records = serializeCard(next);
  if (estimateBytes(records) > CARD_BYTES) throw Object.assign(new Error('full'), { code: 'full' });
  pendingWrite = { serial: tag.serial, afterFp: fingerprint(next), onApplied, at: Date.now() };
  try {
    await nfc.write(records);
  } catch {
    throw new WriteFailed();
  }
  pendingWrite = null;
}

async function onTag(tag) {
  if (busy || Date.now() < lockUntil) return;
  if (view.screen === 'result' && view.back === 'manageWait') {
    setView({ screen: 'manageWait' });
  }
  if (!flows[view.screen]) return; // taps mean nothing on other screens
  busy = true;
  try {
    if (tag.error) {
      notify('Could not read the card. Hold it flat against the back of the phone and try again.');
      return;
    }
    tick();
    // A previous write may have landed even though it reported a failure.
    if (pendingWrite && Date.now() - pendingWrite.at < PENDING_MS
        && tag.serial === pendingWrite.serial && fingerprint(tag.card) === pendingWrite.afterFp) {
      const { onApplied } = pendingWrite;
      pendingWrite = null;
      onApplied();
      return;
    }
    await flows[view.screen](tag);
  } catch (err) {
    if (err instanceof WriteFailed) notify('WRITE FAILED. Hold the card flat against the phone and tap it again.');
    else if (err.code === 'full') notify('CARD IS FULL. It has no room for another ticket type.');
    else notify(err.message || 'Something went wrong. Try again.');
  } finally {
    busy = false;
    lockUntil = Math.max(lockUntil, Date.now() + LOCK_MS);
  }
}

const sameCard = (tag) => !view.serial || !tag.serial || view.serial === tag.serial;

function cardSummary(card) {
  const parts = Object.keys(card.tickets).filter((n) => card.tickets[n] > 0).sort()
    .map((n) => `${shortName(n)} ${card.tickets[n]}`);
  return parts.length ? parts.join(' · ') : 'empty';
}

function readRows(card) {
  return Object.keys(card.tickets).filter((n) => card.tickets[n] > 0).sort().map((name) => ({ name, count: card.tickets[name] }));
}

const flows = {
  async loadTap(tag) {
    const v = view;
    let next = tag.card;
    for (const l of v.lines) next = addTickets(next, l.key, l.qty);
    const hadTickets = Object.values(tag.card.tickets).some((n) => n > 0);
    const done = () => {
      cart = { qty: {}, card: null };
      const lines = [];
      if (v.lines.length) lines.push(`Loaded: ${v.lines.map((l) => `${l.qty} × ${l.label}`).join(', ')}`);
      else lines.push('No tickets were loaded.');
      lines.push(`Card now holds: ${cardSummary(next)}`);
      if (v.isNew && hadTickets) lines.push('Note: this card already had tickets. They were kept.');
      lines.push(`Payment: ${formatMoney(v.total)}`);
      showResult('ok', 'LOADED', lines, 'cart', 'operate');
    };
    if (!v.lines.length) { done(); return; } // new card only: nothing to write
    await writeCard(tag, next, done);
    done();
  },

  async manageWait(tag) {
    setView({ screen: 'manageEdit', serial: tag.serial, fp: fingerprint(tag.card), rows: readRows(tag.card) });
  },

  async manageEdit(tag) {
    if (isManageDirty()) {
      notify('Finish with this card first: press WRITE TO CARD or CANCEL.', 'warn');
      return;
    }
    await flows.manageWait(tag);
  },

  async manageTap(tag) {
    if (!sameCard(tag)) {
      notify('WRONG CARD. Tap the same card that was read first, or press CANCEL.');
      return;
    }
    if (fingerprint(tag.card) !== view.fp) {
      // Someone spent tickets since it was read. Show what is there now rather than overwrite blindly.
      setView({
        screen: 'manageEdit', serial: tag.serial, fp: fingerprint(tag.card), rows: readRows(tag.card),
        notice: { text: 'The card changed since you read it. Its latest contents are shown. Review, then write again.', kind: 'warn' },
      });
      failure();
      return;
    }
    const next = { tickets: Object.fromEntries(view.rows.map((r) => [r.name, r.count])), extras: tag.card.extras };
    const done = () => showResult('ok', 'CARD UPDATED', [`Card now holds: ${cardSummary(next)}`], 'manageWait', 'manage');
    await writeCard(tag, next, done);
    done();
  },
};

/* --------------------------------------------------------------- actions */

async function startNfc() {
  const ok = await nfc.start();
  nfcState = { scanning: ok, error: ok ? null : nfcState.error };
  render();
}

function enterNfcScreen(next) {
  unlockAudio();
  setKeepAwake(true);
  pendingWrite = null;
  setView(next);
  if (!nfcState.scanning) startNfc();
}

function leaveNfc() {
  nfc.stop();
  nfcState = { scanning: false, error: null };
  setKeepAwake(false);
  pendingWrite = null;
}

function startSetup() {
  draft = configToDraft(config);
  if (!draft.grill.length) draft.grill.push({ name: '', price: '' });
  setView({ screen: 'setup', initial: JSON.stringify(draft) });
}

function trySave() {
  const { config: next, errors } = draftToConfig(draft);
  if (errors.length) {
    failure();
    view = { ...view, errors };
    render();
    $screen.scrollTop = 0;
    return false;
  }
  if (!saveConfig(next)) {
    failure();
    view = { ...view, errors: ['Could not save. This browser is blocking storage; try the installed app, not a private window.'] };
    render();
    $screen.scrollTop = 0;
    return false;
  }
  config = next;
  cart = { qty: {}, card: null };
  success();
  return true;
}

async function confirmLeave() {
  if (isManageDirty()) {
    return confirmDialog('DISCARD CHANGES?', 'You changed amounts but have not written them to the card.', 'DISCARD');
  }
  if (isSetupDirty()) {
    return confirmDialog('LEAVE WITHOUT SAVING?', 'Your changes to the setup have not been saved.', 'LEAVE');
  }
  return true;
}

function goOperate() {
  if (!isConfigured(config)) {
    showDialog(`<h2>SET UP FIRST</h2><p>Enter your ticket prices in SETUP before selling tickets.</p>
      <form method="dialog" class="dialog-actions"><button class="big primary" value="ok">OK</button></form>`);
    return;
  }
  enterNfcScreen({ screen: 'cart' });
}

const actions = {
  setup: () => { leaveNfc(); startSetup(); },

  async operate() {
    if (!(await confirmLeave())) return;
    goOperate();
  },

  async home() {
    if (!(await confirmLeave())) return;
    leaveNfc();
    setView({ screen: 'home' });
  },

  async manage() {
    enterNfcScreen({ screen: 'manageWait' });
  },

  async install() {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      render();
    } else {
      showDialog(installHelp());
    }
  },

  read: () => startNfc(),

  ok() {
    if (view.screen !== 'result') return;
    if (view.back === 'manageWait') setView({ screen: 'manageWait' });
    else setView({ screen: 'cart' });
  },

  /* setup */
  addGrill() {
    draft.grill.push({ name: '', price: '' });
    render();
    const inputs = $screen.querySelectorAll('[data-grill="name"]');
    inputs[inputs.length - 1]?.focus();
  },
  delGrill({ i }) {
    draft.grill.splice(Number(i), 1);
    render();
  },
  save() {
    if (trySave()) setView({ screen: 'home' });
  },
  saveOperate() {
    if (trySave()) goOperate();
  },
  async clearEvent() {
    if (!(await confirmDialog('ERASE EVENT SETUP?', 'All prices and ticket types will be deleted from this phone. Cards are not changed.', 'ERASE'))) return;
    clearConfig();
    config = null;
    cart = { qty: {}, card: null };
    startSetup();
  },

  /* operate */
  step({ scope, i, d }) {
    const delta = Number(d);
    if (scope === 'cart') {
      const key = sellableItems(config)[Number(i)].key;
      cart.qty[key] = clamp((cart.qty[key] || 0) + delta, 0, MAX_COUNT);
      refreshCart();
    } else {
      const row = view.rows[Number(i)];
      row.count = clamp(row.count + delta, 0, MAX_COUNT);
      refreshManage();
    }
  },
  addBundle({ i }) {
    const it = sellableItems(config)[Number(i)];
    cart.qty[it.key] = clamp((cart.qty[it.key] || 0) + it.bundleQty, 0, MAX_COUNT);
    refreshCart();
  },
  cardMode({ v }) {
    cart.card = v;
    refreshCart();
  },
  clear() {
    cart = { qty: {}, card: null };
    refreshCart();
  },
  finalize() {
    if (!nfc.supported) { notify('NFC is not available on this phone.'); return; }
    const lines = cartLines().filter((l) => l.qty > 0).map((l) => ({ key: l.it.key, label: l.it.label, qty: l.qty }));
    setView({ screen: 'loadTap', lines, isNew: cart.card === 'new', total: cartTotal() });
    if (!nfcState.scanning) startNfc();
  },
  cancelLoad: () => setView({ screen: 'cart' }),

  /* manage */
  addType() {
    const have = new Set(view.rows.map((r) => r.name));
    const suggestions = ['GAME', 'PRIZE', ...(config?.grill || []).map((g) => `GRILL:${g.name}`)].filter((n) => !have.has(n));
    showDialog(`
      <h2>ADD TICKET TYPE</h2>
      <div class="pick-list">
        ${suggestions.map((n) => `<button class="big secondary" data-act="pickType" data-name="${esc(n)}">${esc(n)}</button>`).join('')}
      </div>
      <label class="lbl">Other type (e.g. GRILL:MEAL)
        <input class="field" id="customName" autocapitalize="characters" autocomplete="off">
      </label>
      <p class="notice error" id="customErr" hidden></p>
      <div class="dialog-actions">
        <button class="big cancel" data-act="closeDialog">CANCEL</button>
        <button class="big go" data-act="addCustom">ADD</button>
      </div>`);
  },
  writeCard() {
    setView({ ...view, screen: 'manageTap', notice: null });
    if (!nfcState.scanning) startNfc();
  },
  cancelWrite: () => setView({ ...view, screen: 'manageEdit', notice: null }),
  async cancelManage() {
    if (!(await confirmLeave())) return;
    setView({ screen: 'manageWait' });
  },
};

// Actions that live inside the dialog.
const dialogActions = {
  closeDialog: () => $dialog.close(),
  pickType({ name }) {
    addRow(name);
  },
  addCustom() {
    const name = cleanName(document.getElementById('customName').value);
    const err = document.getElementById('customErr');
    if (!name || !parseTicketText(`${name}=0`) || view.rows.some((r) => r.name === name)) {
      err.textContent = name && view.rows.some((r) => r.name === name)
        ? 'The card already has that type.'
        : 'Use letters, numbers, spaces, - and _, with one optional :VARIANT.';
      err.hidden = false;
      return;
    }
    addRow(name);
  },
};

function addRow(name) {
  $dialog.close();
  view.rows.push({ name, count: 1 });
  view.rows.sort((a, b) => (a.name < b.name ? -1 : 1));
  render();
}

function handleClick(e) {
  const btn = e.target.closest('[data-act]');
  if (btn && !btn.disabled) actions[btn.dataset.act]?.(btn.dataset);
}
$screen.addEventListener('click', handleClick);
$bar.addEventListener('click', handleClick);
$dialog.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (btn) dialogActions[btn.dataset.act]?.(btn.dataset);
});

// Typing in the setup form and in the quantity boxes updates state without re-rendering.
$screen.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.field) draft[t.dataset.field] = t.value;
  else if (t.dataset.grill) draft.grill[Number(t.dataset.i)][t.dataset.grill] = t.value;
  else if (t.classList.contains('qty-input')) {
    const n = clamp(parseInt(t.value.replace(/\D/g, ''), 10) || 0, 0, MAX_COUNT);
    if (t.dataset.scope === 'cart') {
      cart.qty[sellableItems(config)[Number(t.dataset.i)].key] = n;
      refreshCart();
    } else {
      view.rows[Number(t.dataset.i)].count = n;
      refreshManage();
    }
  }
});
$screen.addEventListener('change', (e) => {
  if (e.target.classList.contains('qty-input')) {
    e.target.blur();
    if (view.screen === 'cart') refreshCart(); else refreshManage();
  }
});
$screen.addEventListener('focusin', (e) => {
  if (e.target.classList.contains('qty-input')) e.target.select();
});
$screen.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input')) e.target.blur();
});

/* ----------------------------------------------------------------- misc */

function showDialog(html) {
  $dialog.innerHTML = html;
  $dialog.returnValue = '';
  $dialog.showModal();
}

function confirmDialog(title, text, yes) {
  return new Promise((resolve) => {
    showDialog(`
      <h2>${esc(title)}</h2>
      <p>${esc(text)}</p>
      <form method="dialog" class="dialog-actions">
        <button class="big go" value="no">STAY</button>
        <button class="big cancel" value="yes">${esc(yes)}</button>
      </form>`);
    $dialog.addEventListener('close', () => resolve($dialog.returnValue === 'yes'), { once: true });
  });
}

function installHelp() {
  const ua = navigator.userAgent;
  let title = 'ON A COMPUTER';
  let steps = '<li>Click the <b>install icon</b> at the right end of the address bar, or open the browser’s <b>⋮ menu</b>.</li><li>Choose <b>Install Carnival Manager</b>.</li>';
  if (/iphone|ipad/i.test(ua)) {
    title = 'ON IPHONE / IPAD';
    steps = '<li>Tap the <b>Share</b> button in Safari.</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>';
  } else if (/android/i.test(ua)) {
    title = 'ON ANDROID';
    steps = '<li>Tap the <b>⋮ menu</b> (top right of Chrome).</li><li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li><li>Tap <b>Install</b>.</li>';
  }
  return `
    <h2>INSTALL THE APP</h2>
    <h3>${title}</h3>
    <ol>${steps}</ol>
    <p>After installing, open <b>Carnival Manager</b> from the home screen. It works with no internet.</p>
    <form method="dialog" class="dialog-actions"><button class="big primary" value="ok">OK</button></form>`;
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  render();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && NFC_SCREENS.includes(view.screen) && !nfcState.scanning) startNfc();
});

// Stop the long-press menu older phones show on big buttons.
document.addEventListener('contextmenu', (e) => e.preventDefault());

async function boot() {
  nfc = await createNfc();
  nfc.onTag = onTag;
  nfc.onStatus = (s) => {
    nfcState = { scanning: s.scanning, error: s.error || null };
    if (barInfo()?.nfc) render();
  };
  requestPersistence();
  render();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
