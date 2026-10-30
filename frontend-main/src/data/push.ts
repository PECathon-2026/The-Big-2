/** Web Push helpers: register the service worker, subscribe with the server's VAPID key, remember the endpoint. */
import { API_BASE } from './api';

const ENDPOINT_KEY = 'tsukuyomi-push-endpoint';

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function savedEndpoint(): string | null {
  try {
    return localStorage.getItem(ENDPOINT_KEY);
  } catch {
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const h = window.setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => (window.clearTimeout(h), resolve(v)),
      (e) => (window.clearTimeout(h), reject(e)),
    );
  });
}

function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Ensures a push subscription exists and is known to the backend. Returns its endpoint.
 * Throws with a readable message when the browser refuses (permission denied, no HTTPS/localhost, no SW support).
 */
export async function ensureSubscribed(): Promise<string> {
  if (!pushSupported()) throw new Error('This browser has no Web Push support (needs HTTPS or localhost and a service worker).');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const reg = await withTimeout(navigator.serviceWorker.register('/sw.js'), 10_000, 'The service worker did not start. Reload the page and try again.');
  await withTimeout(navigator.serviceWorker.ready, 10_000, 'The service worker did not start. Reload the page and try again.');

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const r = await fetch(`${API_BASE}/api/alerts/vapid-public-key`);
    if (!r.ok) throw new Error(`backend did not return a VAPID key (${r.status})`);
    const { public_key } = (await r.json()) as { public_key: string };
    // the browser's own push service (FCM, Mozilla, Apple) can be slow or blocked on some networks
    sub = await withTimeout(
      reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(public_key) }),
      25_000,
      "Your browser's push service did not answer. Try again, or use “Add to calendar”.",
    );
  }

  const res = await fetch(`${API_BASE}/api/alerts/subscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!res.ok) throw new Error(`subscribe failed: ${res.status} ${await res.text()}`);
  try {
    localStorage.setItem(ENDPOINT_KEY, sub.endpoint);
  } catch {
    /* storage may be unavailable */
  }
  return sub.endpoint;
}

export async function unsubscribe(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch(`${API_BASE}/api/alerts/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' });
    await sub.unsubscribe();
  }
  try {
    localStorage.removeItem(ENDPOINT_KEY);
  } catch {
    /* ignore */
  }
}
