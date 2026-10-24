// On-screen NFC simulator, loaded only when the URL has ?sim=1.
// Lets you practice every mode, train operators, and test on a desktop browser
// without any NFC hardware. Same interface as WebNfc in nfc.js.

import { parseCard } from './tickets.js';

const PRESENT_MS = 2500; // how long a simulated card "stays on the phone" after a tap

const CARDS = [
  { serial: '04:A1:B2:C3', text: '' },
  { serial: '04:D4:E5:F6', text: 'GAME=3\nGRILL:MEAL=1\nPRIZE=7' },
  { serial: '04:07:08:09', text: 'GAME=1\nGRILL:MEAL=2\nGRILL:BEVERAGE=4' },
];

export class SimNfc {
  supported = true;
  scanning = false;
  onTag = () => {};
  onStatus = () => {};
  #present = null;
  #presentTimer = null;
  #failNext = false;
  #panel;

  constructor() {
    this.cards = CARDS.map((c) => ({ ...c }));
    this.#mount();
  }

  async start() {
    this.scanning = true;
    this.onStatus({ scanning: true });
    return true;
  }

  stop() {
    this.scanning = false;
  }

  async write(records, { timeoutMs = 6000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (this.#present === null) {
      if (Date.now() > deadline) throw Object.assign(new Error('No card'), { name: 'AbortError' });
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 150));
    if (this.#failNext) {
      this.#failNext = false;
      this.#panel.querySelector('[data-fail]').checked = false;
      throw Object.assign(new Error('Simulated write failure'), { name: 'NetworkError' });
    }
    if (this.#present === null) throw Object.assign(new Error('Card removed'), { name: 'NetworkError' });
    const lines = records.filter((r) => r.recordType === 'text').map((r) => r.text);
    this.cards[this.#present].text = lines.join('\n');
    this.#refresh();
  }

  #tap(index) {
    clearTimeout(this.#presentTimer);
    this.#present = index;
    this.#presentTimer = setTimeout(() => { this.#present = null; this.#refresh(); }, PRESENT_MS);
    this.#refresh();
    const card = this.cards[index];
    const records = card.text.split('\n').filter(Boolean).map((t) => ({ recordType: 'text', text: t }));
    if (this.scanning) this.onTag({ serial: card.serial, card: parseCard(records) });
  }

  #refresh() {
    this.cards.forEach((c, i) => {
      const area = this.#panel.querySelector(`[data-text="${i}"]`);
      if (document.activeElement !== area) area.value = c.text;
      this.#panel.querySelector(`[data-tap="${i}"]`).classList.toggle('on', this.#present === i);
    });
  }

  #mount() {
    const wrap = document.createElement('div');
    wrap.id = 'sim';
    wrap.innerHTML = `
      <button class="sim-toggle" type="button">SIM</button>
      <div class="sim-panel" hidden>
        <p><b>NFC simulator</b> — edit a card's tickets, then tap it.</p>
        ${this.cards.map((c, i) => `
          <div class="sim-card">
            <button type="button" data-tap="${i}">TAP CARD ${'ABC'[i]}</button>
            <span>${c.serial}</span>
            <textarea data-text="${i}" rows="4" spellcheck="false">${c.text}</textarea>
          </div>`).join('')}
        <label><input type="checkbox" data-fail> Fail the next write</label>
      </div>`;
    document.body.append(wrap);
    this.#panel = wrap.querySelector('.sim-panel');
    wrap.querySelector('.sim-toggle').onclick = () => { this.#panel.hidden = !this.#panel.hidden; };
    wrap.querySelectorAll('[data-tap]').forEach((b) => { b.onclick = () => this.#tap(+b.dataset.tap); });
    wrap.querySelectorAll('[data-text]').forEach((a) => {
      a.oninput = () => { this.cards[+a.dataset.text].text = a.value; };
    });
    wrap.querySelector('[data-fail]').onchange = (e) => { this.#failNext = e.target.checked; };
  }
}
