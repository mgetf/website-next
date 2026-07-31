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
 * Owner permission is STATUS or ADMIN.
 */
export async function toggle1v1Ready(teamId: number, requestingSteamId: string): Promise<void> {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const opts = ramaClientOpts();
    const { createTeamsClient, getTeam, getRosterMember, setTeamStatus } =
      await import('$lib/server/rama/teams');
    const { createDivisionsClient, getDivision } = await import('$lib/server/rama/divisions');
    const teams = createTeamsClient(opts);
    const teamKey = String(teamId);
    const team = await getTeam(teams, teamKey);
    if (!team) notFound('1v1 entry not found');
    if (Number(team.formatId) !== FORMAT_1V1) badRequest('This is not a 1v1 entry');

    const member = await getRosterMember(teams, teamKey, requestingSteamId);
    if (
      !member?.active ||
      (member.permissionLevel !== 'STATUS' && member.permissionLevel !== 'ADMIN')
    ) {
      forbidden('You can only ready up your own 1v1 entry');
    }

    if (String(team.status) !== TeamStatus.UNREADY) {
      badRequest('Entry must be in UNREADY status to ready up');
    }

    const division = team.divisionId
      ? await getDivision(createDivisionsClient(opts), String(team.divisionId))
      : null;
    const isFreeDiv = !division || Number(division.signupCost ?? 0) === 0;
    if (!isFreeDiv && member.paymentStatus === 'UNPAID') {
      badRequest('You must be paid before readying up');
    }

    const ack = await setTeamStatus(teams, { teamId: teamKey, status: 'PENDING' });
    if (!ack.ok) badRequest(ack.error ?? 'Failed to ready up');
    return;
  }
  throw new Error('toggle1v1Ready requires DATA_BACKEND=rama');
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
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const opts = ramaClientOpts();
    const { createTeamsClient, getTeam, getRosterMember } = await import('$lib/server/rama/teams');
    const teams = createTeamsClient(opts);
    const teamKey = String(teamId);
    const team = await getTeam(teams, teamKey);
    if (!team) notFound('1v1 entry not found');
    if (Number(team.formatId) !== FORMAT_1V1) badRequest('This is not a 1v1 entry');
    if (String(team.status) === TeamStatus.DEAD) {
      badRequest('This 1v1 entry has already been withdrawn');
    }

    if (!isAdmin) {
      const member = await getRosterMember(teams, teamKey, requestingSteamId);
      if (
        !member?.active ||
        (member.permissionLevel !== 'STATUS' && member.permissionLevel !== 'ADMIN')
      ) {
        forbidden('You can only withdraw from your own 1v1 entry');
      }
    }

    await disbandTeam(teamId);
    return;
  }
  throw new Error('withdraw1v1Entry requires DATA_BACKEND=rama');
}

/**
 * Restore a withdrawn 1v1 entry (admin only)
 * Sets team status back to UNREADY and re-joins the creator as STATUS.
 */
export async function restore1v1Entry(teamId: number): Promise<void> {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const opts = ramaClientOpts();
    const { createTeamsClient, getTeam, joinTeam, setMemberPermission, setTeamStatus } =
      await import('$lib/server/rama/teams');
    const teams = createTeamsClient(opts);
    const teamKey = String(teamId);
    const team = await getTeam(teams, teamKey);
    if (!team) notFound('1v1 entry not found');
    if (Number(team.formatId) !== FORMAT_1V1) badRequest('This is not a 1v1 entry');
    if (String(team.status) !== TeamStatus.DEAD) {
      badRequest('This 1v1 entry is not withdrawn');
    }

    const creatorSteamId = String(team.createdBy ?? '');
    if (!creatorSteamId) badRequest('Cannot restore 1v1 entry without creator');

    const statusAck = await setTeamStatus(teams, { teamId: teamKey, status: 'UNREADY' });
    if (!statusAck.ok) badRequest(statusAck.error ?? 'Failed to restore entry');

    const joinAck = await joinTeam(teams, { teamId: teamKey, steamId: creatorSteamId });
    if (!joinAck.ok) badRequest(joinAck.error ?? 'Failed to restore roster');

    const permAck = await setMemberPermission(teams, {
      teamId: teamKey,
      steamId: creatorSteamId,
      permissionLevel: 'STATUS',
    });
    if (!permAck.ok) badRequest(permAck.error ?? 'Failed to restore owner permission');
    return;
  }
  throw new Error('restore1v1Entry requires DATA_BACKEND=rama');
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
  if (!VALID_1V1_STATUSES.includes(newStatus)) {
    badRequest(`Invalid status: ${newStatus}`);
  }

  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const opts = ramaClientOpts();
    const { createTeamsClient, getTeam, getRoster, joinTeam, setMemberPermission, setTeamStatus } =
      await import('$lib/server/rama/teams');
    const { createDivisionsClient, getDivision } = await import('$lib/server/rama/divisions');
    const teams = createTeamsClient(opts);
    const teamKey = String(teamId);
    const team = await getTeam(teams, teamKey);
    if (!team) notFound('1v1 entry not found');
    if (Number(team.formatId) !== FORMAT_1V1) badRequest('This is not a 1v1 entry');

    const oldStatus = String(team.status) as TeamStatus;
    if (oldStatus === newStatus) badRequest('Status is already ' + newStatus);

    if (newStatus === TeamStatus.READY) {
      const division = team.divisionId
        ? await getDivision(createDivisionsClient(opts), String(team.divisionId))
        : null;
      const isFreeDiv = !division || Number(division.signupCost ?? 0) === 0;
      if (!isFreeDiv) {
        const roster = await getRoster(teams, teamKey);
        const player = Object.values(roster).find((m) => m.active);
        if (!player || player.paymentStatus === 'UNPAID') {
          badRequest('Cannot set entry to READY: player must be marked as paid first');
        }
      }
    }

    if (newStatus === TeamStatus.DEAD) {
      await disbandTeam(teamId);
      return { oldStatus, newStatus };
    }

    if (oldStatus === TeamStatus.DEAD) {
      const creatorSteamId = String(team.createdBy ?? '');
      if (!creatorSteamId) badRequest('Cannot restore 1v1 entry without creator');

      const statusAck = await setTeamStatus(teams, {
        teamId: teamKey,
        status: newStatus as 'UNREADY' | 'PENDING' | 'READY' | 'DEAD' | 'PLACEMENT',
      });
      if (!statusAck.ok) badRequest(statusAck.error ?? 'Failed to update status');

      const joinAck = await joinTeam(teams, { teamId: teamKey, steamId: creatorSteamId });
      if (!joinAck.ok) badRequest(joinAck.error ?? 'Failed to restore roster');

      const permAck = await setMemberPermission(teams, {
        teamId: teamKey,
        steamId: creatorSteamId,
        permissionLevel: 'STATUS',
      });
      if (!permAck.ok) badRequest(permAck.error ?? 'Failed to restore owner permission');
      return { oldStatus, newStatus };
    }

    const ack = await setTeamStatus(teams, {
      teamId: teamKey,
      status: newStatus as 'UNREADY' | 'PENDING' | 'READY' | 'DEAD' | 'PLACEMENT',
    });
    if (!ack.ok) badRequest(ack.error ?? 'Failed to update status');
    return { oldStatus, newStatus };
  }
  throw new Error('change1v1Status requires DATA_BACKEND=rama');
}
