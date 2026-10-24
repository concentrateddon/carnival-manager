// Event configuration kept in the phone's localStorage. Everything is try/catch'd:
// private windows or a full disk must never crash the app, only be reported.

import { isValidConfig } from './pricing.js';

const KEY = 'carnival-manager.event.v1';

export function loadConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const config = JSON.parse(raw);
    return isValidConfig(config) ? config : null;
  } catch {
    return null;
  }
}

/** Returns true if the config was stored. */
export function saveConfig(config) {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
    return loadConfig() !== null;
  } catch {
    return false;
  }
}

export function clearConfig() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* nothing to clear */ }
}

/** Ask the browser not to evict our data under storage pressure. Best effort. */
export function requestPersistence() {
  try {
    navigator.storage?.persist?.();
  } catch { /* ignore */ }
}
