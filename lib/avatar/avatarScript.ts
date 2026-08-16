'use client';

import { useState, useEffect } from 'react';

const SCRIPT_URL = 'https://ai-avatar-ui-ghost.vercel.app/ai-avatar-ui.js';

let injectedPromise: Promise<void> | null = null;

function makeUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `avatar-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ensureRandomUuidPolyfill() {
  if (typeof window === 'undefined') return;

  const cryptoApi = window.crypto as Crypto & { randomUUID?: () => string };
  if (!cryptoApi) return;

  if (typeof cryptoApi.randomUUID !== 'function' && typeof cryptoApi.getRandomValues === 'function') {
    const makeUuid = () => {
      const bytes = new Uint8Array(16);
      cryptoApi.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    };

    Object.defineProperty(cryptoApi, 'randomUUID', {
      configurable: true,
      value: makeUuid,
    });

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: cryptoApi,
    });

    Object.defineProperty(window, 'crypto', {
      configurable: true,
      value: cryptoApi,
    });
  }
}

export function ensureAvatarIdentityCookie(appId = 'default') {
  if (typeof window === 'undefined') return;

  ensureRandomUuidPolyfill();

  const storageKey = 'avatar-user-id';
  let userId = window.localStorage.getItem(storageKey);
  if (!userId) {
    userId = makeUuid();
    window.localStorage.setItem(storageKey, userId);
  }

  const cookieValue = `${encodeURIComponent(userId)}`;
  document.cookie = `x-user-id=${cookieValue}; path=/; max-age=31536000; SameSite=Lax`;
  document.cookie = `x-app-id=${encodeURIComponent(appId)}; path=/; max-age=31536000; SameSite=Lax`;
}

export function getAvatarUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('avatar-user-id');
}


function waitForCustomElement(tagName: string, timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (customElements.get(tagName)) {
      resolve();
      return;
    }

    const start = Date.now();
    const interval = window.setInterval(() => {
      if (customElements.get(tagName)) {
        window.clearInterval(interval);
        resolve();
        return;
      }

      if (Date.now() - start > timeoutMs) {
        window.clearInterval(interval);
        reject(new Error(`Timed out waiting for <${tagName}> to be defined`));
      }
    }, 50);
  });
}

/** Ensures the avatar web components script is in the DOM exactly once,
 * across however many AvatarComponents/AvatarSettingsOnly instances mount
 * over the app's lifetime, and waits until the custom elements are ready
 * before callers render them. */
export function ensureAvatarScriptInjected(scriptUrl: string = SCRIPT_URL, appId = 'default'): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (injectedPromise) return injectedPromise;

  ensureRandomUuidPolyfill();
  ensureAvatarIdentityCookie(appId);

  if (customElements.get('avatar-model')) {
    injectedPromise = Promise.resolve();
    return injectedPromise;
  }

  const existing = document.querySelector(`script[src="${scriptUrl}"]`) as HTMLScriptElement | null;
  if (existing) {
    // If the script tag is already present, don't remove or re-add it —
    // simply wait for the custom element to be defined. Removing the
    // existing script can cause the bundle to be reloaded or lose state
    // and event bindings, breaking functionality.
    injectedPromise = waitForCustomElement('avatar-model');
    return injectedPromise;
  }

  injectedPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => {
      waitForCustomElement('avatar-model').then(resolve).catch(reject);
    };
    script.onerror = () => {
      injectedPromise = null;
      reject(new Error(`Failed to load avatar script: ${scriptUrl}`));
    };
    document.body.appendChild(script);
  });

  return injectedPromise;
}
/** Compatibility export — mirrors lib/useAvatarScript.ts's old API (now
 * deleted) so useAvatarProfile.ts and AvatarComponents.tsx don't need
 * their own logic, just this file's loadAvatarScript() naming. */
export function loadAvatarScript(): Promise<void> {
  return ensureAvatarScriptInjected();
}

/** React hook wrapper — same behavior as the old useAvatarScript.ts hook,
 * now backed by ensureAvatarScriptInjected()'s customElements-aware wait. */
export function useAvatarScript(): boolean {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureAvatarScriptInjected()
      .then(() => {
        if (!cancelled) setLoaded(true);
      })
      .catch((error) => {
        console.error('[useAvatarScript] failed to load avatar script:', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return loaded;
}