// Runs in a browser (open test/index.html via a static server) or in Node:
//   node test/pricing.test.js
import {
  parseMoney, formatMoney, quote, describeQuote, sellableItems, priceLine,
  draftToConfig, configToDraft, isValidConfig, isConfigured, cleanName,
} from '../public/js/pricing.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.message }); }
}
function eq(a, b, msg = '') {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${msg} expected ${y}, got ${x}`);
}

const GAME = { price: 100, bundleQty: 20, bundlePrice: 1000 };
const draft = (over = {}) => ({
  eventName: '', gamePrice: '1.00', bundleQty: '20', bundlePrice: '10.00',
  grill: [{ name: 'meal', price: '10' }, { name: 'Beverage', price: '1' }], buyIn: '5', ...over,
});

test('parseMoney', () => {
  eq(parseMoney('10'), 1000);
  eq(parseMoney('$10.5'), 1050);
  eq(parseMoney('1,000.25'), 100025);
  eq(parseMoney('.5'), 50);
  eq(parseMoney('0'), 0);
  eq(parseMoney(''), null);
  eq(parseMoney('abc'), null);
  eq(parseMoney('-3'), null);
  eq(parseMoney('1.234'), null);
  eq(parseMoney('999999999'), null);
});

test('formatMoney', () => {
  eq(formatMoney(1000), '$10.00');
  eq(formatMoney(5), '$0.05');
});

test('quote without a bundle is simple multiplication', () => {
  eq(quote(3, { price: 1000 }).cost, 3000);
  eq(quote(0, GAME).cost, 0);
});

test('quote applies full bundles then singles', () => {
  eq(quote(5, GAME).cost, 500);
  eq(quote(20, GAME).cost, 1000);
  const q = quote(25, GAME);
  eq([q.cost, q.bundles, q.singles], [1500, 1, 5]);
  eq(quote(45, GAME).cost, 2500);
  eq(describeQuote(q), '1 bundle + 5 single');
});

test('leftover singles never cost more than another bundle', () => {
  const q = quote(19, GAME);
  eq([q.cost, q.bundles, q.singles, q.partial], [1000, 1, 0, true]);
  eq(quote(39, GAME).cost, 2000);
  eq(quote(10, GAME).cost, 1000);
  eq(quote(11, GAME).cost, 1000);
});

test('sellableItems and priceLine', () => {
  const { config } = draftToConfig(draft());
  const items = sellableItems(config);
  eq(items.map((i) => i.key), ['GAME', 'GRILL:MEAL', 'GRILL:BEVERAGE']);
  eq(priceLine(items[0]), '$1.00 each · 20 for $10.00');
  eq(priceLine(items[1]), '$10.00 each');
});

test('draftToConfig builds a valid config', () => {
  const { config, errors } = draftToConfig(draft({ eventName: ' Fall Fair ' }), 123);
  eq(errors, []);
  eq(config, {
    version: 1, eventName: 'Fall Fair', game: GAME,
    grill: [{ name: 'MEAL', price: 1000 }, { name: 'BEVERAGE', price: 100 }], buyIn: 500, updatedAt: 123,
  });
  eq(isValidConfig(config), true);
  eq(isConfigured(config), true);
});

test('GAME can be skipped and bundle is optional', () => {
  eq(draftToConfig(draft({ gamePrice: '', bundleQty: '', bundlePrice: '' })).config.game, null);
  eq(draftToConfig(draft({ bundleQty: '', bundlePrice: '' })).config.game, { price: 100 });
});

test('validation errors', () => {
  const bad = (over) => draftToConfig(draft(over)).errors;
  if (!bad({ bundleQty: '1' }).length) throw new Error('bundle size 1');
  if (!bad({ bundlePrice: '' }).length) throw new Error('missing bundle price');
  if (!bad({ bundlePrice: '25' }).length) throw new Error('bundle not cheaper');
  if (!bad({ gamePrice: '', }).length) throw new Error('bundle without game price');
  if (!bad({ grill: [{ name: 'MEAL', price: '1' }, { name: 'meal', price: '2' }] }).length) throw new Error('duplicate');
  if (!bad({ grill: [{ name: 'a:b', price: '1' }] }).length) throw new Error('colon in name');
  if (!bad({ grill: [{ name: '', price: '1' }] }).length) throw new Error('missing name');
  if (!bad({ grill: [{ name: 'MEAL', price: '' }] }).length) throw new Error('missing price');
  if (!bad({ buyIn: 'x' }).length) throw new Error('bad buy-in');
  if (!bad({ gamePrice: '', bundleQty: '', bundlePrice: '', grill: [{ name: '', price: '' }] }).length) throw new Error('nothing to sell');
});

test('blank grill rows are ignored; names are cleaned', () => {
  const { config } = draftToConfig(draft({ grill: [{ name: '', price: '' }, { name: '  hot   dog ', price: '3' }], buyIn: '' }));
  eq(config.grill, [{ name: 'HOT DOG', price: 300 }]);
  eq(config.buyIn, 0);
  eq(cleanName(' a  b '), 'A B');
});

test('configToDraft round trips', () => {
  const { config } = draftToConfig(draft());
  eq(draftToConfig(configToDraft(config), config.updatedAt).config, config);
});

test('isValidConfig rejects junk', () => {
  eq(isValidConfig(null), false);
  eq(isValidConfig({ version: 1, game: null, grill: 'x', buyIn: 0 }), false);
  eq(isValidConfig({ version: 2, game: null, grill: [], buyIn: 0 }), false);
});

export { results };

if (typeof process !== 'undefined' && process.argv && import.meta.url.endsWith(process.argv[1] || '')) {
  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : ' — ' + r.error}`);
    if (!r.ok) failed++;
  }
  process.exit(failed ? 1 : 0);
}
