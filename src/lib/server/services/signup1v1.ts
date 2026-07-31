/**
 * 1v1 League Signup Service
 * Handles individual player signup for 1v1 leagues using 1-person teams
 * The team abstraction is completely hidden from users
 *
 * 1v1 Status Model
 * ================
 * 1v1 entries use the same lifecycle as 2v2:
 * - UNREADY: Signed up, not yet readied
 * - PENDING: Player toggled ready, awaiting admin approval
 * - READY:   Admin approved, active for the season
 * - DEAD:    Withdrawn
 *
 * "Active" (not withdrawn) means status !== DEAD.
 */

import { badRequest, forbidden, notFound } from '$lib/server/utils/errors';
import { getCurrentSignupSeasonIds, getSignupSeasonForRegion } from './signupSeasons';
import { FORMAT_1V1 } from '$lib/server/constants/formats';
import { disbandTeam } from './teamManagement';
import { TeamStatus } from '$lib/types/enums';

const ACTIVE_1V1_STATUSES: TeamStatus[] = [
  TeamStatus.UNREADY,
  TeamStatus.PENDING,
  TeamStatus.READY,
];

interface Signup1v1Context {
  isLoggedIn: boolean;
  hasActive1v1Entry: boolean;
  signupClosed: boolean;
  user: {
    steamId: string;
    steamUsername: string;
    steamAvatar: string | null;
  } | null;
}

interface Signup1v1Data {
  ownerSteamId: string;
  regionId: number;
  divisionId: number;
}

/**
 * Get 1v1 signup context for a user
 * Now uses per-season settings instead of global
 */
export async function get1v1SignupContext(steamId: string | null): Promise<Signup1v1Context> {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { hasAnyOpenSignup } = await import('$lib/server/services/signupSeasons');
    const anySignupsOpen = await hasAnyOpenSignup();
    let hasActive1v1Entry = false;
    let user: Signup1v1Context['user'] = null;
    if (steamId) {
      const { createUsersClient, getUser } = await import('$lib/server/rama/users');
      const { createTeamsClient, getPlayerSeasonTeam, getTeam } =
        await import('$lib/server/rama/teams');
      const opts = ramaClientOpts();
      const userRow = await getUser(createUsersClient(opts), steamId);
      user = userRow
        ? {
            steamId,
            steamUsername: String(userRow.username ?? steamId),
            steamAvatar: String(userRow.avatarUrl ?? ''),
          }
        : { steamId, steamUsername: steamId, steamAvatar: null };
      const seasonIds = await getCurrentSignupSeasonIds(FORMAT_1V1);
      const teams = createTeamsClient(opts);
      for (const seasonId of seasonIds) {
        const teamId = await getPlayerSeasonTeam(teams, steamId, String(seasonId));
        if (!teamId) continue;
        const team = await getTeam(teams, teamId);
        if (!team) continue;
        if (Number(team.formatId) !== FORMAT_1V1) continue;
        if (!ACTIVE_1V1_STATUSES.includes(String(team.status) as TeamStatus)) continue;
        hasActive1v1Entry = true;
        break;
      }
    }
    return {
      isLoggedIn: !!steamId,
      hasActive1v1Entry,
      signupClosed: !anySignupsOpen,
      user,
    };
  }
  throw new Error('get1v1SignupContext requires DATA_BACKEND=rama');
}

/**
 * Validate 1v1 signup data
 */
export async function validate1v1Signup(data: Signup1v1Data): Promise<void> {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const ctx = await get1v1SignupContext(data.ownerSteamId);
    if (ctx.hasActive1v1Entry) {
      badRequest('You are already signed up for the 1v1 league this season');
    }
    const opts = ramaClientOpts();
    const { createDivisionsClient, getDivision } = await import('$lib/server/rama/divisions');
    const { createCatalogClient, getRegion } = await import('$lib/server/rama/catalog');
    const division = await getDivision(createDivisionsClient(opts), String(data.divisionId));
    if (!division) badRequest('Invalid division selected');
    const region = await getRegion(createCatalogClient(opts), String(data.regionId));
    if (!region) badRequest('Invalid region selected');
    const seasonId = await getSignupSeasonForRegion(data.regionId, FORMAT_1V1);
    if (!seasonId) badRequest('No active 1v1 signup season for this region');
    return;
  }
  throw new Error('validate1v1Signup requires DATA_BACKEND=rama');
}

/**
 * Sign up a player for the 1v1 league
 * If the player previously withdrew from the same region+division, reactivates that entry.
 * Otherwise creates a new 1-person "team" with the player's Steam name and avatar frozen at signup time.
 */
export async function signup1v1(data: Signup1v1Data): Promise<number> {
  // Validate first
  await validate1v1Signup(data);

  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const opts = ramaClientOpts();
    const { createUsersClient, getUser } = await import('$lib/server/rama/users');
    const { createTeamsClient, createTeam } = await import('$lib/server/rama/teams');
    const { hashPassword } = await import('$lib/server/utils/password');
    const user = await getUser(createUsersClient(opts), data.ownerSteamId);
    if (!user) badRequest('User not found');
    const seasonId = await getSignupSeasonForRegion(data.regionId, FORMAT_1V1);
    if (!seasonId) badRequest('No active 1v1 signup season for this region');
    const teamId = Date.now() % 2_000_000_000;
    const name = String(user.username ?? data.ownerSteamId);
    const ack = await createTeam(createTeamsClient(opts), {
      teamId: String(teamId),
      steamId: data.ownerSteamId,
      name,
      acronym: '',
      formatId: String(FORMAT_1V1),
      seasonId: String(seasonId),
      divisionId: String(data.divisionId),
      regionId: String(data.regionId),
      joinPassword: await hashPassword(`1v1-${teamId}`),
    });
    if (!ack.ok) badRequest(ack.error || 'Failed to create 1v1 entry');
    return teamId;
  }
  throw new Error('signup1v1 requires DATA_BACKEND=rama');
}

/**
 * Toggle a 1v1 entry from UNREADY to PENDING.
 * Requires the player to be paid (for paid divisions).
 */
export async function toggle1v1Ready(teamId: number, requestingSteamId: string): Promise<void> {
  throw new Error('toggle1v1Ready is not available under Rama');
}

/**
 * Withdraw a player from a 1v1 league entry
 * Only the player themselves or an admin can withdraw
 */
export async function withdraw1v1Entry(
  teamId: number,
  requestingSteamId: string,
  isAdmin: boolean,
): Promise<void> {
  throw new Error('withdraw1v1Entry is not available under Rama');
}

/**
 * Restore a withdrawn 1v1 entry (admin only)
 * Sets team status back to READY and reactivates the player
 */
export async function restore1v1Entry(teamId: number): Promise<void> {
  throw new Error('restore1v1Entry is not available under Rama');
}

const VALID_1V1_STATUSES: TeamStatus[] = [
  TeamStatus.UNREADY,
  TeamStatus.PENDING,
  TeamStatus.READY,
  TeamStatus.DEAD,
];

/**
 * Change a 1v1 entry's status (admin only).
 * Handles side effects: transitioning to DEAD deactivates the player,
 * transitioning from DEAD reactivates them.
 * Setting to READY is hard-blocked for paid divisions unless the player is paid.
 */
export async function change1v1Status(
  teamId: number,
  newStatus: TeamStatus,
): Promise<{ oldStatus: string; newStatus: string }> {
  throw new Error('change1v1Status is not available under Rama');
}
