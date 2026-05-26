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
