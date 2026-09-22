import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const ipv4Block = new BlockList();
ipv4Block.addSubnet('0.0.0.0', 8, 'ipv4');
ipv4Block.addSubnet('10.0.0.0', 8, 'ipv4');
ipv4Block.addSubnet('100.64.0.0', 10, 'ipv4');
ipv4Block.addSubnet('127.0.0.0', 8, 'ipv4');
ipv4Block.addSubnet('169.254.0.0', 16, 'ipv4');
ipv4Block.addSubnet('172.16.0.0', 12, 'ipv4');
ipv4Block.addSubnet('192.168.0.0', 16, 'ipv4');

const ipv6Block = new BlockList();
ipv6Block.addAddress('::1', 'ipv6');
ipv6Block.addSubnet('fc00::', 7, 'ipv6');
ipv6Block.addSubnet('fe80::', 10, 'ipv6');

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

export class PublicHttpsUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicHttpsUrlError';
  }
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '');
}

function ipv4FromMapped(address: string): string | null {
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:')) {
    return lower.slice('::ffff:'.length);
  }
  return null;
}

export function isBlockedAddress(address: string): boolean {
  const mapped = ipv4FromMapped(address);
  const ip = mapped ?? address;

  const kind = isIP(ip);
  if (kind === 4) return ipv4Block.check(ip, 'ipv4');
  if (kind === 6) return ipv6Block.check(ip, 'ipv6');
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = stripIpv6Brackets(hostname).toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  return isBlockedAddress(host);
}

export function parsePublicHttpsUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new PublicHttpsUrlError('URL is required');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new PublicHttpsUrlError('Invalid URL');
  }

  if (url.protocol !== 'https:') {
    throw new PublicHttpsUrlError('URL must use https');
  }

  if (url.username || url.password) {
    throw new PublicHttpsUrlError('URL must not include credentials');
  }

  if (isBlockedHostname(url.hostname)) {
    throw new PublicHttpsUrlError('URL host is not allowed');
  }

  return url;
}

export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  const url = parsePublicHttpsUrl(raw);
  const hostname = stripIpv6Brackets(url.hostname);

  if (isIP(hostname)) {
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new PublicHttpsUrlError('Could not resolve URL host');
  }

  if (addresses.length === 0 || addresses.some((entry) => isBlockedAddress(entry.address))) {
    throw new PublicHttpsUrlError('URL host is not allowed');
  }

  return url;
}

const MAX_REDIRECTS = 5;

export async function fetchPublicHttps(
  rawUrl: string,
  opts: { maxBytes: number; timeoutMs: number },
): Promise<Response> {
  let current = await assertPublicHttpsUrl(rawUrl);

  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    const res = await fetch(current.href, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(opts.timeoutMs),
      headers: { 'User-Agent': 'mge.tf-map-catalog' },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        throw new PublicHttpsUrlError(`Redirect from ${current.href} had no Location header`);
      }
      current = await assertPublicHttpsUrl(new URL(location, current).href);
      continue;
    }

    if (!res.ok) {
      throw new PublicHttpsUrlError(`Failed to fetch ${current.href} (HTTP ${res.status})`);
    }

    const contentLength = res.headers.get('content-length');
    if (contentLength) {
      const size = Number(contentLength);
      if (Number.isFinite(size) && size > opts.maxBytes) {
        throw new PublicHttpsUrlError(`File at ${current.href} is larger than the allowed size`);
      }
    }

    return res;
  }

  throw new PublicHttpsUrlError(`Too many redirects fetching ${rawUrl}`);
}
