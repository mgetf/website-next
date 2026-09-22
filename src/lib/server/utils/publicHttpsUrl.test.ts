import { describe, expect, it } from 'vitest';
import {
  isBlockedAddress,
  isBlockedHostname,
  parsePublicHttpsUrl,
  PublicHttpsUrlError,
} from './publicHttpsUrl';

describe('parsePublicHttpsUrl', () => {
  it('accepts a public https URL', () => {
    const url = parsePublicHttpsUrl('https://fastdl.example.com/maps/mge_foo.bsp');
    expect(url.href).toBe('https://fastdl.example.com/maps/mge_foo.bsp');
  });

  it('rejects http', () => {
    expect(() => parsePublicHttpsUrl('http://fastdl.example.com/mge_foo.bsp')).toThrow(
      PublicHttpsUrlError,
    );
  });

  it('rejects localhost', () => {
    expect(() => parsePublicHttpsUrl('https://localhost/mge_foo.bsp')).toThrow(PublicHttpsUrlError);
    expect(() => parsePublicHttpsUrl('https://127.0.0.1/mge_foo.bsp')).toThrow(PublicHttpsUrlError);
  });

  it('rejects private and metadata addresses', () => {
    expect(() => parsePublicHttpsUrl('https://10.0.0.5/x')).toThrow(PublicHttpsUrlError);
    expect(() => parsePublicHttpsUrl('https://192.168.1.1/x')).toThrow(PublicHttpsUrlError);
    expect(() => parsePublicHttpsUrl('https://169.254.169.254/latest/meta-data')).toThrow(
      PublicHttpsUrlError,
    );
  });

  it('rejects credentials in the URL', () => {
    expect(() => parsePublicHttpsUrl('https://user:pass@example.com/file.bsp')).toThrow(
      PublicHttpsUrlError,
    );
  });
});

describe('isBlockedHostname / isBlockedAddress', () => {
  it('blocks loopback and IPv4-mapped loopback', () => {
    expect(isBlockedHostname('localhost')).toBe(true);
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
    expect(isBlockedAddress('::1')).toBe(true);
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true);
  });

  it('allows a public IPv4 address', () => {
    expect(isBlockedAddress('1.1.1.1')).toBe(false);
    expect(isBlockedHostname('github.com')).toBe(false);
  });
});
