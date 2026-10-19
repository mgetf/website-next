/**
 * Opt a browser into operating-system notifications.
 * The permission prompt only runs from enableBrowserPush(), after a click.
 */

export type BrowserPushStatus = 'hidden' | 'off' | 'on' | 'blocked';

interface StoredKeys {
  p256dh?: string;
  auth?: string;
}

function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

let publicKeyRequest: Promise<string | null> | null = null;

async function publicKey(): Promise<string | null> {
  if (!publicKeyRequest) {
    publicKeyRequest = fetch('/api/notifications/push')
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as { data?: { publicKey?: string | null } };
        const key = body.data?.publicKey?.trim();
        return key || null;
      })
      .catch(() => null);
  }
  const key = await publicKeyRequest;
  if (!key) publicKeyRequest = null;
  return key;
}

function applicationServerKey(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index++) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

async function existingSubscription(): Promise<PushSubscription | null> {
  const current = await navigator.serviceWorker.getRegistration('/');
  if (!current) return null;
  return current.pushManager.getSubscription();
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  const keys = json.keys as StoredKeys | undefined;
  if (!json.endpoint || !keys?.p256dh || !keys.auth) {
    throw new Error('Could not read this browser subscription');
  }

  const response = await fetch('/api/notifications/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
    }),
  });
  if (!response.ok) {
    throw new Error('Could not save this computer');
  }
}

export async function readBrowserPushStatus(): Promise<BrowserPushStatus> {
  if (!supported()) return 'hidden';
  const key = await publicKey();
  if (!key) return 'hidden';
  if (Notification.permission === 'denied') return 'blocked';
  const subscription = await existingSubscription();
  return subscription ? 'on' : 'off';
}

/**
 * If this browser is already subscribed, attach it to the logged-in account.
 * Does not ask for permission.
 */
export async function syncBrowserPush(): Promise<BrowserPushStatus> {
  const status = await readBrowserPushStatus();
  if (status !== 'on') return status;
  try {
    const subscription = await existingSubscription();
    if (subscription) await saveSubscription(subscription);
  } catch {
    // The next click can retry. The local subscription is still valid.
  }
  return 'on';
}

export async function enableBrowserPush(): Promise<void> {
  const key = await publicKey();
  if (!key) throw new Error('Computer notifications are not configured');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked in this browser'
        : 'Permission was not granted',
    );
  }

  const worker = await registration();
  const subscription =
    (await worker.pushManager.getSubscription()) ??
    (await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(key),
    }));
  await saveSubscription(subscription);
}

export async function disableBrowserPush(): Promise<void> {
  const subscription = await existingSubscription();
  const endpoint = subscription?.endpoint;
  if (subscription) await subscription.unsubscribe();
  if (!endpoint) return;

  await fetch('/api/notifications/push', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}
