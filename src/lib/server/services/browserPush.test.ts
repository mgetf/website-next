import { describe, expect, it } from 'vitest';
import {
  browserPushTitle,
  browserPushUrl,
  buildBrowserPushPayload,
  isStalePushStatus,
} from './browserPush';
import { normalizeVapidSubject } from '#lib/server/utils/env.js';

describe('buildBrowserPushPayload', () => {
  it('uses the notification message and keeps the click on this site', () => {
    const payload = JSON.parse(
      buildBrowserPushPayload({
        id: 12,
        type: 'PLAYER_INVITE',
        url: '/teams/4',
        message: 'You were invited to Join',
      }),
    );

    expect(payload).toEqual({
      title: 'Team invitation',
      body: 'You were invited to Join',
      url: '/teams/4',
      tag: 'notification-12',
    });
  });

  it('falls back to the type title when the message is empty', () => {
    const payload = JSON.parse(
      buildBrowserPushPayload({
        id: 3,
        type: 'MATCH_CREATED',
        url: '/matches/9',
        message: '   ',
      }),
    );

    expect(payload.title).toBe('Match scheduled');
    expect(payload.body).toBe('Match scheduled');
  });

  it('rejects a url that would leave the site', () => {
    expect(browserPushUrl('https://evil.example/phish')).toBe('/');
    expect(browserPushUrl('//evil.example/phish')).toBe('/');
    expect(browserPushUrl('/users/1/notifications')).toBe('/users/1/notifications');
  });

  it('truncates a long message', () => {
    const payload = JSON.parse(
      buildBrowserPushPayload({
        id: 1,
        type: 'MATCH_COMM',
        url: '/matches/1',
        message: 'm'.repeat(400),
      }),
    );

    expect(payload.body).toHaveLength(180);
  });

  it('uses a generic title for an unknown type', () => {
    expect(browserPushTitle('SOMETHING_ELSE')).toBe('mge.tf');
  });

  it('names a rulebook revision', () => {
    expect(browserPushTitle('RULEBOOK')).toBe('Rulebook update');
  });
});

describe('isStalePushStatus', () => {
  it('treats 404 and 410 as a dead browser subscription', () => {
    expect(isStalePushStatus(404)).toBe(true);
    expect(isStalePushStatus(410)).toBe(true);
    expect(isStalePushStatus(500)).toBe(false);
  });
});

describe('normalizeVapidSubject', () => {
  it('keeps a mailto or https contact and replaces anything else', () => {
    expect(normalizeVapidSubject('https://mge.tf')).toBe('https://mge.tf');
    expect(normalizeVapidSubject(' mailto:notifications@mge.tf ')).toBe(
      'mailto:notifications@mge.tf',
    );
    expect(normalizeVapidSubject('not-a-url')).toBe('mailto:notifications@mge.tf');
  });
});
