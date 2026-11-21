/**
 * Reminders for scheduled matches.
 *
 * There is no scheduler on the site; the Discord bot's outbox poll calls this.
 * It runs at most once a minute and only looks a day ahead. Dedupe keys make a
 * repeat run harmless.
 */

import { prisma } from '#lib/server/db.js';
import { discordRecipients, enqueueOutbox, siteUrl } from '#lib/server/services/outbox.js';
import { getPlayoffMatchLabel } from '#lib/server/services/playoffSlots.js';
import { matchReminderItems, reminderStage } from '#lib/server/utils/playoffEvents.js';
import { MatchStatus } from '#prisma/client.js';

const SWEEP_EVERY_MS = 60 * 1000;
const LOOKAHEAD_MS = 24 * 3600 * 1000;

let lastSweep = 0;

/** Queue the reminders that are due. Returns how many messages were queued. */
export async function enqueueDueMatchReminders(
  now: Date = new Date(),
  options: { force?: boolean } = {},
): Promise<number> {
  if (!options.force && now.getTime() - lastSweep < SWEEP_EVERY_MS) return 0;
  lastSweep = now.getTime();

  const upcoming = await prisma.match.findMany({
    where: {
      status: MatchStatus.UNPLAYED,
      matchDateTime: { gt: now, lte: new Date(now.getTime() + LOOKAHEAD_MS) },
    },
    select: {
      id: true,
      matchDateTime: true,
      homeTeam: { select: { id: true, name: true, division: { select: { name: true } } } },
      awayTeam: { select: { id: true, name: true } },
    },
  });

  let queued = 0;
  for (const match of upcoming) {
    if (!match.matchDateTime) continue;
    const stage = reminderStage(match.matchDateTime, now);
    if (!stage) continue;

    const recipients = await discordRecipients(prisma, [match.homeTeam.id, match.awayTeam.id]);
    if (recipients.length === 0) continue;

    const items = matchReminderItems(
      {
        id: match.id,
        division: match.homeTeam.division?.name ?? 'League',
        round: await getPlayoffMatchLabel(match.id),
        home: { id: match.homeTeam.id, name: match.homeTeam.name },
        away: { id: match.awayTeam.id, name: match.awayTeam.name },
        url: siteUrl(`/matches/${match.id}`),
      },
      { startsAt: match.matchDateTime, stage },
      recipients,
    );
    await enqueueOutbox(prisma, items);
    queued += items.length;
  }
  return queued;
}
