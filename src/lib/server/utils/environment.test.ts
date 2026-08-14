import { describe, expect, it } from 'vitest';
import {
  isLinkPreviewCrawler,
  isUngatedRoute,
  shouldBypassStagingGateForCrawler,
  UNGATED_ROUTES,
} from './environment';

describe('isUngatedRoute', () => {
  it('allows auth routes needed for login', () => {
    for (const route of UNGATED_ROUTES) {
      expect(isUngatedRoute(route)).toBe(true);
      expect(isUngatedRoute(`${route}/extra`)).toBe(true);
    }
  });

  it('gates normal application routes', () => {
    expect(isUngatedRoute('/')).toBe(false);
    expect(isUngatedRoute('/admin/users')).toBe(false);
    expect(isUngatedRoute('/api/paypal/create-order')).toBe(false);
  });
});

describe('isLinkPreviewCrawler', () => {
  it('recognizes Discord and other preview bots', () => {
    expect(
      isLinkPreviewCrawler('Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'),
    ).toBe(true);
    expect(isLinkPreviewCrawler('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)')).toBe(
      true,
    );
    expect(isLinkPreviewCrawler('facebookexternalhit/1.1')).toBe(true);
  });

  it('rejects normal browsers and empty agents', () => {
    expect(isLinkPreviewCrawler('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0')).toBe(
      false,
    );
    expect(isLinkPreviewCrawler(null)).toBe(false);
    expect(isLinkPreviewCrawler('')).toBe(false);
  });
});

describe('shouldBypassStagingGateForCrawler', () => {
  const discordUa = 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)';

  it('allows Discordbot GET on public profile pages', () => {
    expect(shouldBypassStagingGateForCrawler(discordUa, 'GET', '/users/76561198001291200')).toBe(
      true,
    );
    expect(shouldBypassStagingGateForCrawler(discordUa, 'HEAD', '/teams/330')).toBe(true);
  });

  it('still blocks APIs, admin, and mutations', () => {
    expect(shouldBypassStagingGateForCrawler(discordUa, 'GET', '/api/servers')).toBe(false);
    expect(shouldBypassStagingGateForCrawler(discordUa, 'GET', '/admin/users')).toBe(false);
    expect(shouldBypassStagingGateForCrawler(discordUa, 'POST', '/users/1')).toBe(false);
  });

  it('does not bypass for normal browsers', () => {
    expect(
      shouldBypassStagingGateForCrawler('Mozilla/5.0 Chrome/120.0.0.0', 'GET', '/users/1'),
    ).toBe(false);
  });
});
