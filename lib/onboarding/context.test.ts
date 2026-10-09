import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceDomainId,
  initialOnboardingState,
  loadPersistedOnboardingState,
  mergeOnboardingState,
  onboardingReducer,
  persistOnboardingState,
  ONBOARDING_STORAGE_KEY,
} from './context';

function installSessionStorage(): Map<string, string> {
  const memory = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, String(value));
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear(),
  };
  const window = {
    sessionStorage,
    location: { search: '' },
  };
  Object.defineProperty(globalThis, 'window', { value: window, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorage, configurable: true, writable: true });
  return memory;
}

test('coerceDomainId accepts positive numbers and numeric strings', () => {
  assert.equal(coerceDomainId(4), 4);
  assert.equal(coerceDomainId('7'), 7);
  assert.equal(coerceDomainId(0), null);
  assert.equal(coerceDomainId(-1), null);
  assert.equal(coerceDomainId('nope'), null);
  assert.equal(coerceDomainId(null), null);
  assert.equal(coerceDomainId(undefined), null);
});

test('SET_PREFERRED_DOMAIN stores a numeric id even when the click payload is a string', () => {
  const next = onboardingReducer(initialOnboardingState, {
    type: 'SET_PREFERRED_DOMAIN',
    payload: { id: '4' as unknown as number, name: 'Hotel' },
  });
  assert.equal(next.preferredDomainId, 4);
  assert.equal(next.preferredDomainName, 'Hotel');
});

test('a persisted domain survives a remount load', () => {
  const memory = installSessionStorage();
  const saved = {
    ...initialOnboardingState,
    preferredDomainId: 4,
    preferredDomainName: 'Hotel',
    level: 'beginner',
  };
  persistOnboardingState(saved);
  assert.ok(memory.get(ONBOARDING_STORAGE_KEY));

  const loaded = loadPersistedOnboardingState();
  assert.equal(loaded.preferredDomainId, 4);
  assert.equal(loaded.preferredDomainName, 'Hotel');
  assert.equal(loaded.level, 'beginner');
});

test('string domain ids in sessionStorage coerce back to numbers', () => {
  const memory = installSessionStorage();
  memory.set(
    ONBOARDING_STORAGE_KEY,
    JSON.stringify({ preferredDomainId: '4', preferredDomainName: 'Hotel' }),
  );
  const loaded = loadPersistedOnboardingState();
  assert.equal(loaded.preferredDomainId, 4);
});

test('HYDRATE keeps an in-memory domain over an empty restore', () => {
  const current = onboardingReducer(initialOnboardingState, {
    type: 'SET_PREFERRED_DOMAIN',
    payload: { id: 4, name: 'Hotel' },
  });
  const hydrated = onboardingReducer(current, {
    type: 'HYDRATE',
    payload: initialOnboardingState,
  });
  assert.equal(hydrated.preferredDomainId, 4);
  assert.equal(hydrated.preferredDomainName, 'Hotel');
});

test('HYDRATE restores a saved domain onto a blank remount', () => {
  const restored = {
    ...initialOnboardingState,
    preferredDomainId: 4,
    preferredDomainName: 'Hotel',
  };
  const hydrated = onboardingReducer(initialOnboardingState, {
    type: 'HYDRATE',
    payload: restored,
  });
  assert.equal(hydrated.preferredDomainId, 4);
});

test('mergeOnboardingState prefers in-memory answers for other fields too', () => {
  const restored = { ...initialOnboardingState, level: 'beginner', preferredMode: 'voice' };
  const current = { ...initialOnboardingState, level: 'advanced' };
  const merged = mergeOnboardingState(restored, current);
  assert.equal(merged.level, 'advanced');
  assert.equal(merged.preferredMode, 'voice');
});
