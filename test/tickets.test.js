// Runs in a browser (open test/index.html via any static server) or in Node:
//   node test/tickets.test.js
import {
  parseTicketText, parseCard, serializeCard, EMPTY_RECORD, fingerprint, grillItems,
  removeTickets, addTickets, estimateBytes, getCount, MAX_COUNT, CARD_BYTES,
} from '../public/js/tickets.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); }
}
function eq(a, b, msg = '') {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${msg} expected ${y}, got ${x}`);
}
const text = (t) => ({ recordType: 'text', text: t });

test('parses a plain ticket record', () => {
  eq(parseTicketText('GAME=3'), { name: 'GAME', count: 3 });
  eq(parseTicketText(' grill:meal = 2 '), { name: 'GRILL:MEAL', count: 2 });
});

test('rejects non-ticket text', () => {
  eq(parseTicketText('hello'), null);
  eq(parseTicketText('GAME=-1'), null);
  eq(parseTicketText('GAME=abc'), null);
  eq(parseTicketText('=5'), null);
});

test('parseCard keeps unknown records as extras', () => {
  const url = { recordType: 'url', text: 'https://example.com' };
  const card = parseCard([text('GAME=2'), url, text('note to self')]);
  eq(card.tickets, { GAME: 2 });
  eq(card.extras.length, 2);
});

test('duplicate ticket records are summed', () => {
  eq(parseCard([text('PRIZE=2'), text('PRIZE=3')]).tickets, { PRIZE: 5 });
});

test('serialize drops zero counts and sorts', () => {
  const card = { tickets: { PRIZE: 4, GAME: 0, 'GRILL:MEAL': 1, GRILL: 2 }, extras: [] };
  eq(serializeCard(card).map((r) => r.text), ['GRILL=2', 'GRILL:MEAL=1', 'PRIZE=4']);
});

test('an empty card still serializes to a writable message', () => {
  const recs = serializeCard({ tickets: { GAME: 0 }, extras: [] });
  eq(recs, [EMPTY_RECORD]);
  const back = parseCard(recs);
  eq(fingerprint(back), '');
  eq(serializeCard(parseCard(recs)), [EMPTY_RECORD]);
});

test('placeholder disappears once real tickets are added', () => {
  const card = addTickets(parseCard([EMPTY_RECORD]), 'GAME', 2);
  eq(serializeCard(card).map((r) => r.text), ['GAME=2']);
});

test('round trip preserves extras', () => {
  const url = { recordType: 'url', text: 'https://example.com' };
  const card = parseCard([text('GAME=1'), url]);
  const back = parseCard(serializeCard(card));
  eq(back.tickets, { GAME: 1 });
  eq(back.extras, [url]);
});

test('grillItems lists bare GRILL then variants with short labels', () => {
  const card = parseCard([text('GRILL:MEAL=3'), text('GRILL=1'), text('GRILL:BEVERAGE=0'), text('GAME=9')]);
  eq(grillItems(card), [
    { key: 'GRILL', label: 'GRILL', count: 1 },
    { key: 'GRILL:MEAL', label: 'MEAL', count: 3 },
  ]);
});

test('removeTickets / addTickets', () => {
  const card = parseCard([text('PRIZE=5')]);
  eq(getCount(removeTickets(card, 'PRIZE', 5), 'PRIZE'), 0);
  eq(getCount(addTickets(card, 'PRIZE', 2), 'PRIZE'), 7);
  let threw = false;
  try { removeTickets(card, 'PRIZE', 6); } catch { threw = true; }
  if (!threw) throw new Error('should refuse to go negative');
  threw = false;
  try { addTickets(card, 'PRIZE', MAX_COUNT); } catch { threw = true; }
  if (!threw) throw new Error('should refuse to exceed max');
});

test('fingerprint ignores zero counts and order', () => {
  const a = parseCard([text('GAME=1'), text('PRIZE=2')]);
  const b = parseCard([text('PRIZE=2'), text('GAME=1'), text('GRILL=0')]);
  eq(fingerprint(a), fingerprint(b));
});

test('a realistic card fits well within NTAG215', () => {
  const card = parseCard([text('GAME=99'), text('GRILL=9'), text('GRILL:MEAL=9'), text('GRILL:BEVERAGE=9'), text('PRIZE=9999')]);
  const bytes = estimateBytes(serializeCard(card));
  if (bytes > CARD_BYTES / 2) throw new Error(`too large: ${bytes}`);
});

export { results };

// Node entry point
if (typeof process !== 'undefined' && process.argv && import.meta.url.endsWith(process.argv[1] || '')) {
  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : ' — ' + r.error}`);
    if (!r.ok) failed++;
  }
  process.exit(failed ? 1 : 0);
}
