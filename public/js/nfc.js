// Web NFC wrapper. Normalizes NDEF records into the plain shape tickets.js uses
// and exposes a tiny callback API:
//
//   const nfc = await createNfc();
//   nfc.onTag    = ({ serial, card }) => {}
//   nfc.onStatus = ({ scanning, error }) => {}
//   await nfc.start();                       // must follow a user tap
//   await nfc.write(records, { timeoutMs }); // card must be on the phone
//
// Add ?sim=1 to the URL to swap in the on-screen simulator (js/sim.js).

import { parseCard } from './tickets.js';

const TEXT_TYPES = new Set(['text', 'url', 'absolute-url']);

function decode(rec) {
  return new TextDecoder(rec.encoding || 'utf-8').decode(rec.data);
}

function normalize(rec) {
  const out = { recordType: rec.recordType, mediaType: rec.mediaType || undefined, id: rec.id || undefined };
  if (TEXT_TYPES.has(rec.recordType)) {
    out.text = rec.data ? decode(rec) : '';
    if (rec.lang) out.lang = rec.lang;
  } else if (rec.data) {
    out.bytes = new Uint8Array(rec.data.buffer, rec.data.byteOffset, rec.data.byteLength).slice();
  }
  return out;
}

function toWeb(rec) {
  if (rec.recordType === 'text') return { recordType: 'text', data: rec.text, lang: rec.lang || 'en' };
  if (TEXT_TYPES.has(rec.recordType)) return { recordType: rec.recordType, data: rec.text };
  const out = { recordType: rec.recordType, data: rec.bytes };
  if (rec.mediaType) out.mediaType = rec.mediaType;
  if (rec.id) out.id = rec.id;
  return out;
}

class WebNfc {
  supported = 'NDEFReader' in window;
  scanning = false;
  onTag = () => {};
  onStatus = () => {};
  #reader = null;
  #abort = null;

  #status(error) {
    this.onStatus({ scanning: this.scanning, error });
  }

  async start() {
    if (!this.supported) {
      this.#status('NFC is not supported in this browser.');
      return false;
    }
    this.stop();
    const abort = new AbortController();
    this.#abort = abort;
    try {
      this.#reader = new NDEFReader();
      this.#reader.onreading = (e) => {
        const card = parseCard([...e.message.records].map(normalize));
        this.onTag({ serial: e.serialNumber || '', card });
      };
      this.#reader.onreadingerror = () => this.onTag({ error: 'unreadable' });
      await this.#reader.scan({ signal: abort.signal });
      this.scanning = true;
      this.#status();
      return true;
    } catch (err) {
      this.scanning = false;
      this.#status(err.name === 'NotAllowedError'
        ? 'NFC permission was blocked. Allow NFC for this site in Chrome settings.'
        : 'Could not start NFC. Make sure NFC is turned on in Android settings.');
      return false;
    }
  }

  stop() {
    if (this.#abort) this.#abort.abort();
    this.#abort = null;
    this.scanning = false;
  }

  async write(records, { timeoutMs = 6000 } = {}) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const reader = this.#reader || new NDEFReader();
      await reader.write({ records: records.map(toWeb) }, { overwrite: true, signal: abort.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function createNfc() {
  if (new URLSearchParams(location.search).has('sim')) {
    const { SimNfc } = await import('./sim.js');
    return new SimNfc();
  }
  return new WebNfc();
}
