/**
 * Compact HMAC team-invite tokens.
 * Format (base64url): version(1) + teamId(4) + exp(4) + hmac-sha256 tag(12)
 */

import crypto from 'crypto';
import { getJwtSecret } from '$lib/server/utils/env';

export const TEAM_INVITE_TTL_SECONDS = 60 * 60;

const VERSION = 1;
const TAG_BYTES = 12;
const PAYLOAD_BYTES = 1 + 4 + 4;
const TOKEN_BYTES = PAYLOAD_BYTES + TAG_BYTES;
const HMAC_DOMAIN = 'mge.tf:team-invite:v1';

export type TeamInviteParseResult =
  { ok: true; teamId: number } | { ok: false; reason: 'invalid' | 'expired' };

function hmacTag(payload: Buffer): Buffer {
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(HMAC_DOMAIN)
    .update(payload)
    .digest()
    .subarray(0, TAG_BYTES);
}

export function createTeamInviteToken(
  teamId: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const payload = Buffer.alloc(PAYLOAD_BYTES);
  payload.writeUInt8(VERSION, 0);
  payload.writeUInt32BE(teamId >>> 0, 1);
  payload.writeUInt32BE(nowSeconds + TEAM_INVITE_TTL_SECONDS, 5);
  return Buffer.concat([payload, hmacTag(payload)]).toString('base64url');
}

export function parseTeamInviteToken(
  token: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): TeamInviteParseResult {
  if (!token) {
    return { ok: false, reason: 'invalid' };
  }

  let decoded: Buffer;
  try {
    decoded = Buffer.from(token, 'base64url');
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  if (decoded.length !== TOKEN_BYTES) {
    return { ok: false, reason: 'invalid' };
  }

  const payload = decoded.subarray(0, PAYLOAD_BYTES);
  const tag = decoded.subarray(PAYLOAD_BYTES);
  const expected = hmacTag(payload);
  if (tag.length !== expected.length || !crypto.timingSafeEqual(tag, expected)) {
    return { ok: false, reason: 'invalid' };
  }

  if (payload.readUInt8(0) !== VERSION) {
    return { ok: false, reason: 'invalid' };
  }

  const teamId = payload.readUInt32BE(1);
  if (teamId < 1) {
    return { ok: false, reason: 'invalid' };
  }

  const exp = payload.readUInt32BE(5);
  if (nowSeconds >= exp) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true, teamId };
}
