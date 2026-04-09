/**
 * Steam ID Conversion Utilities
 * Handles conversions between Steam ID formats
 */

/**
 * Convert Steam ID 32 (e.g., STEAM_0:1:123456) to Steam ID 64
 * @param steamId32 - Steam ID in format STEAM_X:Y:Z
 * @returns Steam ID 64 as string
 */
export function steamId64FromSteamId32(steamId32: string): string {
  const parts = steamId32.split(':');
  if (parts.length !== 3) {
    throw new Error(`Invalid Steam ID 32 format: ${steamId32}`);
  }

  const y = parseInt(parts[1]);
  const z = parseInt(parts[2]);

  if (isNaN(y) || isNaN(z)) {
    throw new Error(`Invalid Steam ID 32 format: ${steamId32}`);
  }

  const steamId64 = BigInt(76561197960265728) + BigInt(y) + BigInt(z) * 2n;
  return steamId64.toString();
}

/**
 * Convert Steam ID 64 to Steam ID 32
 * @param steamId64 - Steam ID 64 as string
 * @returns Steam ID 32 in format STEAM_0:Y:Z
 * @throws Error if the input is not a valid Steam ID 64
 */
export function steamId32FromSteamId64(steamId64: string): string {
  if (!isValidSteamId64(steamId64)) {
    throw new Error(
      `Invalid Steam ID 64: "${steamId64}". Expected a 17-digit numeric string in the valid Steam ID 64 range.`,
    );
  }

  try {
    const id64 = BigInt(steamId64);
    const base = BigInt(76561197960265728);
    const offset = id64 - base;
    const y = offset % 2n;
    const z = offset / 2n;

    return `STEAM_0:${y}:${z}`;
  } catch (err) {
    throw new Error(
      `Failed to convert Steam ID 64 "${steamId64}" to Steam ID 32: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Validate if a string is a valid Steam ID 64
 * Steam ID 64 is a 17-digit number
 */
export function isValidSteamId64(steamId: string): boolean {
  // Check if it's a numeric string
  if (!/^\d+$/.test(steamId)) {
    return false;
  }

  // Check length (17 digits)
  if (steamId.length !== 17) {
    return false;
  }

  // Check if it's within valid range
  const id64 = BigInt(steamId);
  const minId = BigInt(76561197960265728); // Base Steam ID 64
  const maxId = BigInt(99999999999999999); // Theoretical max

  return id64 >= minId && id64 <= maxId;
}

/**
 * Validate if a string is a valid Steam ID 32
 */
export function isValidSteamId32(steamId: string): boolean {
  const pattern = /^STEAM_[0-5]:[0-1]:\d+$/;
  return pattern.test(steamId);
}

/**
 * Extract Steam ID 64 from various formats
 * Accepts:
 * - Steam ID 64: 76561198012345678
 * - Steam ID 32: STEAM_0:1:123456
 * - Profile URL: https://steamcommunity.com/profiles/76561198012345678
 * - Custom URL: https://steamcommunity.com/id/username (returns null, needs API lookup)
 */
export function extractSteamId64(input: string): string | null {
  // Trim whitespace
  input = input.trim();

  // Check if it's already a Steam ID 64
  if (isValidSteamId64(input)) {
    return input;
  }

  // Check if it's a Steam ID 32
  if (isValidSteamId32(input)) {
    return steamId64FromSteamId32(input);
  }

  // Check if it's a profile URL
  const profileMatch = input.match(/steamcommunity\.com\/profiles\/(\d+)/);
  if (profileMatch && isValidSteamId64(profileMatch[1])) {
    return profileMatch[1];
  }

  // Cannot extract from custom URL without API call
  return null;
}
