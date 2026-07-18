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

export function steamId64FromAnyFormat(value: string): string | null {
  const input = value.trim();
  if (!input) return null;

  const profileMatch = input.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (profileMatch) return profileMatch[1];

  if (/^\d{17}$/.test(input)) {
    try {
      return BigInt(input) >= STEAM_ID_64_BASE ? input : null;
    } catch {
      return null;
    }
  }

  const steam3 = input.startsWith('[') ? input : `[${input}]`;
  const fromSteam3 = steamId64FromSteamId3(steam3.toUpperCase());
  if (fromSteam3) return fromSteam3;

  return steamId64FromSteamId32(input.toUpperCase());
}
