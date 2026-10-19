/* mge.tf operating-system notifications.
   Every push shows a notification. Chrome drops the subscription if this handler stays silent. */

self.addEventListener('push', (event) => {
  const payload = readPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/favicon.ico',
      tag: payload.tag,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(
    safeUrl(event.notification.data && event.notification.data.url),
    self.location.origin,
  ).href;
  event.waitUntil(openOrFocus(target));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(replaceSubscription(event.oldSubscription));
});

function readPayload(event) {
  const fallback = { title: 'mge.tf', body: 'New notification', url: '/', tag: 'mge' };
  if (!event.data) return fallback;
  try {
    const data = event.data.json();
    return {
      title: text(data.title, 80) || fallback.title,
      body: text(data.body, 180) || fallback.body,
      url: safeUrl(data.url),
      tag: text(data.tag, 64) || fallback.tag,
    };
  } catch {
    return fallback;
  }
}

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function safeUrl(value) {
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) return value;
  return '/';
}

async function openOrFocus(url) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    if ('focus' in client) {
      await client.focus();
      if ('navigate' in client) await client.navigate(url);
      return;
    }
  }
  await self.clients.openWindow(url);
}

async function replaceSubscription(oldSubscription) {
  const response = await fetch('/api/notifications/push', { credentials: 'include' });
  if (!response.ok) return;
  const body = await response.json();
  const publicKey = body && body.data && body.data.publicKey;
  if (!publicKey) return;

  const subscription = await self.registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(publicKey),
  });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys || !json.keys.p256dh || !json.keys.auth) return;

  await fetch('/api/notifications/push', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });

  if (oldSubscription && oldSubscription.endpoint && oldSubscription.endpoint !== json.endpoint) {
    await fetch('/api/notifications/push', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: oldSubscription.endpoint }),
    });
  }
}

function applicationServerKey(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) output[index] = raw.charCodeAt(index);
  return output;
}
