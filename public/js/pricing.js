// Money, pricing and event-configuration rules. Pure functions (no DOM) so they can be tested.
// All money is stored as whole cents to avoid floating-point rounding.

import { parseTicketText } from './tickets.js';

export const CONFIG_VERSION = 1;
const MAX_CENTS = 10_000_000; // $100,000, a sanity limit that catches typos

/* ---------------------------------------------------------------- money */

/** "10", "10.5", "$1,000.25" → cents. Returns null for blank or invalid text. */
export function parseMoney(text) {
  const t = String(text ?? '').replace(/[$,\s]/g, '');
  const m = /^(\d*)(?:\.(\d{0,2}))?$/.exec(t);
  if (!t || !m || (m[1] === '' && !m[2])) return null;
  const cents = parseInt(m[1] || '0', 10) * 100 + parseInt(((m[2] || '') + '00').slice(0, 2), 10);
  return cents <= MAX_CENTS ? cents : null;
}

export function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Plain number text for an <input>: 1000 → "10.00". */
export function moneyInput(cents) {
  return cents == null ? '' : (cents / 100).toFixed(2);
}

/* -------------------------------------------------------------- quoting */

/**
 * Price for `qty` tickets with automatic best-price bundling.
 * spec: { price, bundleQty?, bundlePrice? }, all in cents / counts.
 * Full bundles are applied first. If the leftover singles would cost more than one
 * more bundle, the leftover is charged at the bundle price (nobody should pay $19
 * for 19 tickets when 20 cost $10).
 */
export function quote(qty, spec) {
  const { price, bundleQty, bundlePrice } = spec;
  if (!qty) return { cost: 0, bundles: 0, singles: 0, partial: false };
  if (bundleQty && bundlePrice) {
    const full = Math.floor(qty / bundleQty);
    const rest = qty - full * bundleQty;
    const partial = rest > 0 && rest * price > bundlePrice;
    return {
      cost: full * bundlePrice + (partial ? bundlePrice : rest * price),
      bundles: full + (partial ? 1 : 0),
      singles: partial ? 0 : rest,
      partial,
    };
  }
  return { cost: qty * price, bundles: 0, singles: qty, partial: false };
}

/** Short human text for a quote, e.g. "1 bundle + 5 single". */
export function describeQuote(q) {
  const parts = [];
  if (q.bundles) parts.push(`${q.bundles} bundle${q.bundles === 1 ? '' : 's'}${q.partial ? ' (partly used)' : ''}`);
  if (q.singles) parts.push(`${q.singles} single`);
  return parts.join(' + ');
}

/** Sellable items from a config: [{ key, label, price, bundleQty?, bundlePrice? }]. */
export function sellableItems(config) {
  const items = [];
  if (config.game) items.push({ key: 'GAME', label: 'GAME', ...config.game });
  for (const g of config.grill) items.push({ key: `GRILL:${g.name}`, label: g.name, price: g.price });
  return items;
}

export function priceLine(item) {
  const each = `${formatMoney(item.price)} each`;
  return item.bundleQty ? `${each} · ${item.bundleQty} for ${formatMoney(item.bundlePrice)}` : each;
}

/* --------------------------------------------------------------- config */

export function isConfigured(config) {
  return !!config && (!!config.game || config.grill.length > 0);
}

export function configToDraft(config) {
  return {
    eventName: config?.eventName || '',
    gamePrice: moneyInput(config?.game?.price),
    bundleQty: config?.game?.bundleQty ? String(config.game.bundleQty) : '',
    bundlePrice: moneyInput(config?.game?.bundlePrice),
    grill: (config?.grill || []).map((g) => ({ name: g.name, price: moneyInput(g.price) })),
    buyIn: config?.buyIn ? moneyInput(config.buyIn) : '',
  };
}

/** Normalises a GRILL variant name: trims, collapses spaces, upper-cases. */
export function cleanName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Turns the setup form's text fields into a config.
 * Returns { config, errors }; config is null when there are errors.
 */
export function draftToConfig(draft, now = Date.now()) {
  const errors = [];
  const cfg = { version: CONFIG_VERSION, eventName: draft.eventName.trim(), game: null, grill: [], buyIn: 0, updatedAt: now };

  // GAME
  const gp = draft.gamePrice.trim();
  const bq = draft.bundleQty.trim();
  const bp = draft.bundlePrice.trim();
  if (gp) {
    const price = parseMoney(gp);
    if (!price) errors.push('GAME single ticket price must be an amount greater than $0, like 1.00.');
    else {
      cfg.game = { price };
      if (bq || bp) {
        const qty = /^\d+$/.test(bq) ? parseInt(bq, 10) : 0;
        const bundlePrice = parseMoney(bp);
        if (qty < 2 || qty > 999) errors.push('GAME bundle size must be a whole number from 2 to 999.');
        else if (!bundlePrice) errors.push('GAME bundle price must be an amount greater than $0.');
        else if (bundlePrice >= qty * price) errors.push(`GAME bundle price must be less than ${qty} single tickets (${formatMoney(qty * price)}).`);
        else Object.assign(cfg.game, { bundleQty: qty, bundlePrice });
      }
    }
  } else if (bq || bp) {
    errors.push('Enter the GAME single ticket price before a bundle price.');
  }

  // GRILL variants
  const seen = new Set();
  draft.grill.forEach((row, i) => {
    const name = cleanName(row.name);
    const priceText = row.price.trim();
    if (!name && !priceText) return; // empty row, ignore
    const label = name || `GRILL item ${i + 1}`;
    if (!name) errors.push(`${label}: enter a name, like MEAL.`);
    else if (!parseTicketText(`GRILL:${name}=1`) || name.includes(':') || name.includes('=')) errors.push(`${name}: use only letters, numbers, spaces, - and _ in the name.`);
    else if (seen.has(name)) errors.push(`${name}: this GRILL item is listed twice.`);
    seen.add(name);
    const price = parseMoney(priceText);
    if (!price) errors.push(`${label}: price must be an amount greater than $0.`);
    else if (name) cfg.grill.push({ name, price });
  });

  // Card buy-in
  if (draft.buyIn.trim()) {
    const buyIn = parseMoney(draft.buyIn);
    if (!buyIn) errors.push('Card price must be an amount greater than $0, or left blank.');
    else cfg.buyIn = buyIn;
  }

  if (!errors.length && !isConfigured(cfg)) errors.push('Set a GAME price or add at least one GRILL item.');
  return errors.length ? { config: null, errors } : { config: cfg, errors };
}

/** Defensive check for data read back from storage. */
export function isValidConfig(c) {
  const int = (n) => Number.isInteger(n) && n > 0;
  return !!c && c.version === CONFIG_VERSION
    && (c.game === null || (int(c.game.price) && (!c.game.bundleQty || (int(c.game.bundleQty) && int(c.game.bundlePrice)))))
    && Array.isArray(c.grill) && c.grill.every((g) => typeof g.name === 'string' && g.name && int(g.price))
    && Number.isInteger(c.buyIn) && c.buyIn >= 0;
}
