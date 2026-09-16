import { redirect } from '@sveltejs/kit';
import { requireAuth, requireTeamAdmin } from '$lib/server/auth/permissions';
import { getTeamFormatCheck } from '$lib/server/services/teams';
import { FORMAT_1V1 } from '$lib/server/constants/formats';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireAuth(locals.user);

  const teamId = parseInt(params.id);
  if (isNaN(teamId)) {
    throw redirect(303, '/');
  }

  const team = await getTeamFormatCheck(teamId);

  if (team?.formatId === FORMAT_1V1) {
    const player = team.players.find((p) => p.active === 1) || team.players[0];
    if (player) {
      throw redirect(301, `/users/${player.playerSteamId}`);
    }
    throw redirect(301, '/');
  }

  await requireTeamAdmin(locals.user, teamId);
  throw redirect(303, `/teams/${teamId}?tab=management`);
};
