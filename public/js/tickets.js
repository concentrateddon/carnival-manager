// Ticket model + card format. Pure functions, no DOM or NFC access, so the
// same rules are shared with the carnival-pos companion app (keep the two copies in sync).
//
// Card format: one NDEF text record per ticket type, "NAME=COUNT".
//   GAME=2   GRILL=1   GRILL:MEAL=3   GRILL:BEVERAGE=1   PRIZE=15
// Any record that is not a ticket record is kept untouched ("extras").

export const MAX_COUNT = 9999;
export const CARD_BYTES = 492; // usable NDEF bytes on an NTAG215 (504 minus capability container)

const NAME_RE = /^[A-Z0-9_-]+(?::[A-Z0-9 _-]+)?$/;
const RECORD_RE = /^\s*(.+?)\s*=\s*(\d{1,6})\s*$/;

/** Parse one record's text; returns {name, count} or null if it isn't a ticket record. */
export function parseTicketText(text) {
  const m = RECORD_RE.exec(String(text));
  if (!m) return null;
  const name = m[1].toUpperCase();
  if (!NAME_RE.test(name)) return null;
  return { name, count: parseInt(m[2], 10) };
}

export function formatTicket(name, count) {
  return `${name}=${count}`;
}

export function emptyCard() {
  return { tickets: {}, extras: [] };
}

/**
 * records: [{ recordType, mediaType?, id?, text?, bytes? }]  (see nfc.js)
 * Returns { tickets: {NAME: count}, extras: [record] }.
 */
export function parseCard(records) {
  const card = emptyCard();
  for (const rec of records || []) {
    if (rec.recordType === 'empty') continue;
    const parsed = rec.recordType === 'text' ? parseTicketText(rec.text) : null;
    if (parsed) {
      card.tickets[parsed.name] = Math.min(MAX_COUNT, (card.tickets[parsed.name] || 0) + parsed.count);
    } else {
      card.extras.push(rec);
    }
  }
  return card;
}

/**
 * Web NFC refuses to write a message with no records, so a card with nothing on it
 * gets this placeholder. It parses as a zero count, which every consumer ignores.
 */
export const EMPTY_RECORD = { recordType: 'text', text: 'GAME=0' };

/** Inverse of parseCard. Zero-count types are dropped. */
export function serializeCard(card) {
  const names = Object.keys(card.tickets).filter((n) => card.tickets[n] > 0).sort();
  const records = names.map((n) => ({ recordType: 'text', text: formatTicket(n, card.tickets[n]) }));
  const all = records.concat(card.extras || []);
  return all.length ? all : [{ ...EMPTY_RECORD }];
}

/** Rough NDEF size in bytes, used to refuse a write that cannot fit. */
export function estimateBytes(records) {
  const enc = new TextEncoder();
  let total = 5; // TLV type + length + terminator
  for (const rec of records) {
    let payload;
    let typeLen;
    if (rec.recordType === 'text') {
      payload = 3 + enc.encode(rec.text).length; // status byte + "en" + text
      typeLen = 1;
    } else {
      payload = rec.bytes ? rec.bytes.length : enc.encode(rec.text || '').length;
      typeLen = (rec.mediaType || rec.recordType || '').length;
    }
    total += 2 + (payload > 255 ? 4 : 1) + typeLen + (rec.id ? rec.id.length + 1 : 0) + payload;
  }
  return total;
}

/** Stable string describing the ticket contents; used to detect a changed card. */
export function fingerprint(card) {
  return Object.keys(card.tickets)
    .filter((n) => card.tickets[n] > 0)
    .sort()
    .map((n) => formatTicket(n, card.tickets[n]))
    .join('|');
}

export function getCount(card, name) {
  return card.tickets[name] || 0;
}

/** Display label: "GRILL" stays "GRILL", "GRILL:MEAL" becomes "MEAL". */
export function grillLabel(key) {
  return key === 'GRILL' ? 'GRILL' : key.slice('GRILL:'.length);
}

/** All GRILL ticket types on the card that have at least one ticket: [{key, label, count}]. */
export function grillItems(card) {
  return Object.keys(card.tickets)
    .filter((n) => (n === 'GRILL' || n.startsWith('GRILL:')) && card.tickets[n] > 0)
    .sort()
    .map((key) => ({ key, label: grillLabel(key), count: card.tickets[key] }));
}

/** Returns a new card with `amount` tickets of `name` removed. Throws if not enough. */
export function removeTickets(card, name, amount) {
  const have = getCount(card, name);
  if (amount > have) throw new Error(`Not enough ${name} tickets`);
  return { tickets: { ...card.tickets, [name]: have - amount }, extras: card.extras };
}

/** Returns a new card with `amount` tickets of `name` added. Throws if over MAX_COUNT. */
export function addTickets(card, name, amount) {
  const next = getCount(card, name) + amount;
  if (next > MAX_COUNT) throw new Error(`Too many ${name} tickets`);
  return { tickets: { ...card.tickets, [name]: next }, extras: card.extras };
}
