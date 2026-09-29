const STEAM_ID_64_BASE = BigInt('76561197960265728');

/**
 * Convert Steam ID 64 to Steam ID 32 (aka Steam2 ID)
 * @example steamId32FromSteamId64("76561198012345678") // "STEAM_0:0:26039975"
 */
export function steamId32FromSteamId64(steamId64: string): string {
  const offset = BigInt(steamId64) - STEAM_ID_64_BASE;
  const y = offset % 2n;
  const z = offset / 2n;

  return `STEAM_0:${y}:${z}`;
}

/**
 * Convert Steam ID 64 to Steam ID 3 format (used in TF2 server logs)
 * @example steamId3FromSteamId64("76561198179807307") // "[U:1:219541579]"
 */
export function steamId3FromSteamId64(steamId64: string): string {
  const accountId = BigInt(steamId64) - STEAM_ID_64_BASE;
  return `[U:1:${accountId}]`;
}

/**
 * Convert Steam ID 3 format (used in TF2 server logs) to Steam ID 64
 * @example steamId64FromSteamId3("[U:1:219541579]") // "76561198179807307"
 * Returns null if the input does not match the expected format.
 */
export function steamId64FromSteamId3(steamId3: string): string | null {
  const match = steamId3.match(/^\[U:1:(\d+)\]$/);
  if (!match) return null;
  return String(STEAM_ID_64_BASE + BigInt(match[1]));
}

/**
 * Convert Steam ID 32 (aka Steam2 ID) to Steam ID 64
 * @example steamId64FromSteamId32("STEAM_0:0:26039975") // "76561198012345678"
 * Returns null if the input does not match the expected format.
 */
export function steamId64FromSteamId32(steamId32: string): string | null {
  const match = steamId32.match(/^STEAM_\d:(\d):(\d+)$/i);
  if (!match) return null;
  const y = BigInt(match[1]);
  const z = BigInt(match[2]);
  return String(STEAM_ID_64_BASE + z * 2n + y);
}

function steamId64FromDigits(value: string): string | null {
  if (!/^\d{17}$/.test(value)) return null;
  try {
    return BigInt(value) >= STEAM_ID_64_BASE ? value : null;
  } catch {
    return null;
  }
}

export function isSteamId64(value: string): boolean {
  return steamId64FromDigits(value) !== null;
}

/** Custom Steam community URL slug, or null if this is not an /id/ URL. */
export function extractSteamVanity(value: string): string | null {
  const match = value.trim().match(/steamcommunity\.com\/id\/([^/?#]+)/i);
  if (!match?.[1]) return null;
  try {
    const vanity = decodeURIComponent(match[1]).trim();
    return vanity || null;
  } catch {
    return match[1];
  }
}

export function steamId64FromAnyFormat(value: string): string | null {
  const input = value.trim();
  if (!input) return null;

  const profileMatch = input.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (profileMatch?.[1]) return steamId64FromDigits(profileMatch[1]);

  const mgeMatch = input.match(/(?:^|https?:\/\/)(?:dev\.)?mge\.tf\/users\/([^/?#]+)/i);
  if (mgeMatch?.[1]) {
    try {
      const nested = steamId64FromAnyFormat(decodeURIComponent(mgeMatch[1]));
      if (nested) return nested;
    } catch {
      const nested = steamId64FromAnyFormat(mgeMatch[1]);
      if (nested) return nested;
    }
  }

  const steamUri = input.match(/steam:\/\/(?:url\/CommunityPage\/|profiles\/)?(\d{17})/i);
  if (steamUri?.[1]) return steamId64FromDigits(steamUri[1]);

  const fromDigits = steamId64FromDigits(input);
  if (fromDigits) return fromDigits;

  const steam3 = input.startsWith('[') ? input : `[${input}]`;
  const fromSteam3 = steamId64FromSteamId3(steam3.toUpperCase());
  if (fromSteam3) return fromSteam3;

  return steamId64FromSteamId32(input.toUpperCase());
}
