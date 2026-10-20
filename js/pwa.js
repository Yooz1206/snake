/**
 * Service worker lifecycle (PRD §10.5, R3.3–R3.9).
 *
 * Nothing here may block play: registration failures only console.warn once,
 * and an update never reloads the page under the player's hands.
 */
import { CONFIG } from './config.js';

/** `?sw=off` unregisters and clears caches so support can unstick a browser. */
export function swDisabledByQuery(search) {
  return new URLSearchParams(search).get('sw') === 'off';
}

/** `snake-v1.0.0` → `snake-v1.1.0`: a release bumps the minor version. */
export function nextCacheName(current) {
  return String(current).replace(/^(.*-v)(\d+)\.\d+\.\d+$/, (_, prefix, major) => `${prefix}${major}.1.0`);
}

async function clearCaches() {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

export async function registerServiceWorker({ onUpdate } = {}) {
  if (!('serviceWorker' in navigator)) return null;

  if (swDisabledByQuery(window.location.search)) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      await clearCaches();
    } catch {
      // Best effort only.
    }
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('sw.js', { scope: './' });

    const notify = () => {
      if (typeof onUpdate === 'function') onUpdate();
    };

    if (registration.waiting) notify();

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) notify();
      });
    });

    return registration;
  } catch (error) {
    console.warn('Service worker registration failed; the game still works online.', error);
    return null;
  }
}

export const CACHE_NAME = CONFIG.pwa.cache;
