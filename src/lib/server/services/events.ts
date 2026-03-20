import { prisma } from '$lib/server/db';
import { notFound } from '$lib/server/utils/errors';
import type {
	EventListItem,
	EventDetail,
	EventPlacementEntry,
	EventStageDetail,
	EventParticipantEntry,
	EventUser,
} from '$lib/types/event';
import type {
	BracketData,
	BracketFormat,
	BracketGame,
	BracketMatch,
	BracketPlayer,
	BracketRound,
	BracketSide,
	BracketStatus,
	MatchStatus,
} from '$lib/types/bracket';
import type { EventType as PrismaEventType, EventStatus as PrismaEventStatus } from '$prisma/client.js';

const USER_SELECT = {
	steamId: true,
	steamUsername: true,
	steamAvatar: true,
} as const;

export async function getAllEvents(): Promise<EventListItem[]> {
	const events = await prisma.event.findMany({
		orderBy: { startedAt: 'desc' },
		include: {
			placements: {
				where: { placement: { lte: 3 } },
				orderBy: { placement: 'asc' },
				include: { user: { select: USER_SELECT } },
			},
			participants: {
				include: { user: { select: USER_SELECT } },
			},
			stages: {
				include: {
					_count: { select: { matches: true } },
				},
			},
		},
	});

	return events.map((e) => {
		const matchCount = e.stages.reduce((sum, s) => sum + s._count.matches, 0);
		return {
			id: e.id,
			name: e.name,
			type: e.type as EventListItem['type'],
			status: e.status as EventListItem['status'],
			isTeamEvent: e.isTeamEvent,
			description: e.description,
			avatar: e.avatar,
			startedAt: e.startedAt?.toISOString() ?? null,
			endedAt: e.endedAt?.toISOString() ?? null,
			prizepool: Number(e.prizepool),
			card: e.card,
			bracketLink: e.bracketLink,
			placements: e.placements.map(mapPlacement),
			matchCount,
			participantCount: e.participants.length,
			stageCount: e.stages.length,
		};
	});
}

export async function getEventById(id: number): Promise<EventDetail> {
	const event = await prisma.event.findUnique({
		where: { id },
		include: {
			placements: {
				orderBy: { placement: 'asc' },
				include: { user: { select: USER_SELECT } },
			},
			participants: {
				orderBy: { seed: 'asc' },
				include: { user: { select: USER_SELECT } },
			},
			stages: {
				orderBy: { orderNum: 'asc' },
				include: {
					_count: { select: { matches: true } },
				},
			},
		},
	});

	if (!event) notFound('Event not found');

	return {
		id: event.id,
		name: event.name,
		type: event.type as EventDetail['type'],
		status: event.status as EventDetail['status'],
		isTeamEvent: event.isTeamEvent,
		description: event.description,
		avatar: event.avatar,
		startedAt: event.startedAt?.toISOString() ?? null,
		endedAt: event.endedAt?.toISOString() ?? null,
		prizepool: Number(event.prizepool),
		card: event.card,
		bracketLink: event.bracketLink,
		placements: event.placements.map(mapPlacement),
		participantCount: event.participants.length,
		stages: event.stages.map(mapStage),
		participants: event.participants.map(mapParticipant),
	};
}

export async function getEventBracketData(stageId: number): Promise<BracketData> {
	const stage = await prisma.eventStage.findUnique({
		where: { id: stageId },
		include: {
			event: { select: { status: true, name: true } },
			matches: {
				orderBy: [{ round: 'asc' }, { orderNum: 'asc' }],
				include: {
					players: { orderBy: { side: 'asc' } },
					games: {
						orderBy: { gameNumber: 'asc' },
						include: { arena: { select: { name: true } } },
					},
				},
			},
		},
	});

	if (!stage) notFound('Event stage not found');

	const format = mapBracketFormat(stage.bracketFormat);
	const status = mapEventStatusToBracketStatus(stage.event.status as PrismaEventStatus);

	if (format === 'card') {
		return buildCardBracket(stage, status);
	}

	if (format === 'double_elim') {
		return buildDoubleElimBracket(stage, status);
	}

	return buildSingleElimBracket(stage, status);
}

export async function createEvent(data: {
	name: string;
	type: PrismaEventType;
	description?: string;
	avatar?: string;
	startedAt?: Date;
	isTeamEvent?: boolean;
	bracketLink?: string;
	prizepool?: number;
	card?: string;
}) {
	return await prisma.event.create({
		data: {
			name: data.name,
			type: data.type,
			description: data.description ?? null,
			avatar: data.avatar ?? null,
			startedAt: data.startedAt ?? null,
			isTeamEvent: data.isTeamEvent ?? false,
			bracketLink: data.bracketLink ?? null,
			prizepool: data.prizepool ?? 0,
			card: data.card ?? null,
			status: 'UPCOMING',
		},
	});
}

export async function getRecentEvents(limit: number = 3): Promise<EventListItem[]> {
	const events = await prisma.event.findMany({
		take: limit,
		orderBy: { startedAt: 'desc' },
		include: {
			placements: {
				where: { placement: { lte: 3 } },
				orderBy: { placement: 'asc' },
				include: { user: { select: USER_SELECT } },
			},
			participants: {
				select: { steamId: true },
			},
			stages: {
				include: {
					_count: { select: { matches: true } },
				},
			},
		},
	});

	return events.map((e) => {
		const matchCount = e.stages.reduce((sum, s) => sum + s._count.matches, 0);
		return {
			id: e.id,
			name: e.name,
			type: e.type as EventListItem['type'],
			status: e.status as EventListItem['status'],
			isTeamEvent: e.isTeamEvent,
			description: e.description,
			avatar: e.avatar,
			startedAt: e.startedAt?.toISOString() ?? null,
			endedAt: e.endedAt?.toISOString() ?? null,
			prizepool: Number(e.prizepool),
			card: e.card,
			bracketLink: e.bracketLink,
			placements: e.placements.map(mapPlacement),
			matchCount,
			participantCount: e.participants.length,
			stageCount: e.stages.length,
		};
	});
}

// ---------------------------------------------------------------------------
// Internal mapping helpers
// ---------------------------------------------------------------------------

interface MatchPlayerRow {
	id: number;
	matchId: number;
	steamId: string | null;
	displayName: string;
	side: number;
}

interface GameRow {
	id: number;
	matchId: number;
	gameNumber: number;
	side1Score: number | null;
	side2Score: number | null;
	arena: { name: string } | null;
}

interface MatchRow {
	id: number;
	stageId: number;
	round: number | null;
	orderNum: number;
	label: string | null;
	winnerSide: number | null;
	side1Score: number | null;
	side2Score: number | null;
	boSeries: number;
	status: string;
	players: MatchPlayerRow[];
	games: GameRow[];
}

interface StageWithMatches {
	id: number;
	name: string;
	bracketFormat: string;
	orderNum: number;
	event: { status: string; name: string };
	matches: MatchRow[];
}

function mapPlacement(p: {
	placement: number;
	steamId: string;
	user: { steamId: string; steamUsername: string; steamAvatar: string | null } | null;
}): EventPlacementEntry {
	return {
		placement: p.placement,
		steamId: p.steamId,
		user: p.user ? mapUser(p.user) : null,
	};
}

function mapUser(u: {
	steamId: string;
	steamUsername: string;
	steamAvatar: string | null;
}): EventUser {
	return { steamId: u.steamId, steamUsername: u.steamUsername, steamAvatar: u.steamAvatar };
}

function mapStage(s: {
	id: number;
	name: string;
	bracketFormat: string;
	orderNum: number;
	_count: { matches: number };
}): EventStageDetail {
	return {
		id: s.id,
		name: s.name,
		bracketFormat: mapBracketFormat(s.bracketFormat),
		orderNum: s.orderNum,
		matchCount: s._count.matches,
	};
}

function mapParticipant(p: {
	steamId: string;
	seed: number | null;
	eliminated: boolean;
	user: { steamId: string; steamUsername: string; steamAvatar: string | null } | null;
}): EventParticipantEntry {
	return {
		steamId: p.steamId,
		seed: p.seed,
		eliminated: p.eliminated,
		user: p.user ? mapUser(p.user) : null,
	};
}

function mapBracketFormat(dbFormat: string): BracketFormat {
	const map: Record<string, BracketFormat> = {
		SINGLE_ELIM: 'single_elim',
		DOUBLE_ELIM: 'double_elim',
		ROUND_ROBIN: 'round_robin',
		CARD: 'card',
	};
	return map[dbFormat] ?? 'single_elim';
}

function mapEventStatusToBracketStatus(status: PrismaEventStatus): BracketStatus {
	if (status === 'IN_PROGRESS' || status === 'REGISTRATION') return 'in_progress';
	if (status === 'COMPLETED') return 'completed';
	return 'upcoming';
}

function mapMatchStatus(status: string): MatchStatus {
	if (status === 'PLAYED') return 'completed';
	return 'upcoming';
}

// ---------------------------------------------------------------------------
// Bracket builders
// ---------------------------------------------------------------------------

function buildSingleElimBracket(stage: StageWithMatches, status: BracketStatus): BracketData {
	const roundGroups = groupMatchesByRound(stage.matches.filter((m) => m.round !== null && m.round > 0));
	const totalRounds = roundGroups.length;

	const rounds: BracketRound[] = roundGroups.map((group, idx) => ({
		number: group.roundNum,
		label: singleElimRoundLabel(idx, totalRounds),
		matches: group.matches.map((m, pos) => buildBracketMatch(m, pos + 1)),
	}));

	padRoundsWithByes(rounds);

	return { format: 'single_elim', status, rounds, title: stage.name };
}

function buildDoubleElimBracket(stage: StageWithMatches, status: BracketStatus): BracketData {
	const winnersMatches = stage.matches.filter((m) => m.round !== null && m.round > 0);
	const losersMatches = stage.matches.filter((m) => m.round !== null && m.round < 0);
	const grandFinalMatches = stage.matches.filter((m) => m.round === 0);

	const winnersGroups = groupMatchesByRound(winnersMatches);
	const losersGroups = groupMatchesByRound(losersMatches, true);

	const totalWinners = winnersGroups.length;
	const totalLosers = losersGroups.length;

	const rounds: BracketRound[] = winnersGroups.map((group, idx) => ({
		number: group.roundNum,
		label: winnersRoundLabel(idx, totalWinners),
		matches: group.matches.map((m, pos) => buildBracketMatch(m, pos + 1)),
	}));

	const loserRounds: BracketRound[] = losersGroups.map((group, idx) => ({
		number: group.roundNum,
		label: losersRoundLabel(idx, totalLosers),
		matches: group.matches.map((m, pos) => buildBracketMatch(m, pos + 1)),
	}));

	padRoundsWithByes(rounds);

	let grandFinal: BracketRound | undefined;
	if (grandFinalMatches.length > 0) {
		grandFinal = {
			number: 0,
			label: 'Grand Final',
			matches: grandFinalMatches.map((m, pos) => buildBracketMatch(m, pos + 1)),
		};
	}

	return {
		format: 'double_elim',
		status,
		rounds,
		loserRounds: loserRounds.length > 0 ? loserRounds : undefined,
		grandFinal,
		title: stage.name,
	};
}

function buildCardBracket(stage: StageWithMatches, status: BracketStatus): BracketData {
	const sorted = [...stage.matches].sort((a, b) => a.orderNum - b.orderNum);
	const matches: BracketMatch[] = sorted.map((m, pos) => buildBracketMatch(m, pos + 1));

	const round: BracketRound = {
		number: 1,
		label: 'Card',
		matches,
	};

	return { format: 'card', status, rounds: [round], title: stage.name };
}

// ---------------------------------------------------------------------------
// Match-level mapping
// ---------------------------------------------------------------------------

function buildBracketMatch(match: MatchRow, position: number): BracketMatch {
	const side1Players = match.players.filter((p) => p.side === 1);
	const side2Players = match.players.filter((p) => p.side === 2);

	const isBye =
		side1Players.some((p) => p.displayName === 'BYE') ||
		side2Players.some((p) => p.displayName === 'BYE') ||
		side1Players.length === 0 ||
		side2Players.length === 0;

	const side1 = buildSide(side1Players, match.side1Score, match.winnerSide === 1);
	const side2 = buildSide(side2Players, match.side2Score, match.winnerSide === 2);

	const games: BracketGame[] | undefined =
		match.games.length > 0
			? match.games.map((g) => ({
					gameNumber: g.gameNumber,
					side1Score: g.side1Score ?? 0,
					side2Score: g.side2Score ?? 0,
					arena: g.arena?.name,
				}))
			: undefined;

	return {
		id: match.id,
		round: Math.abs(match.round ?? 1),
		position,
		side1,
		side2,
		bestOf: match.boSeries && match.boSeries > 0 ? match.boSeries : undefined,
		status: mapMatchStatus(match.status),
		isBye,
		label: match.label ?? undefined,
		games,
	};
}

function buildSide(
	players: { displayName: string; steamId: string | null; side: number }[],
	score: number | null,
	isWinner: boolean,
): BracketSide {
	if (players.length === 0) {
		return { label: 'TBD', score: score ?? undefined, isWinner: false };
	}

	const isByeSide = players.length === 1 && players[0].displayName === 'BYE';
	if (isByeSide) {
		return { label: 'BYE', score: score ?? undefined, isWinner: false };
	}

	const label =
		players.length === 1
			? players[0].displayName
			: players.map((p) => p.displayName).join(' & ');

	const bracketPlayers: BracketPlayer[] = players
		.filter((p) => p.displayName !== 'BYE')
		.map((p) => ({
			name: p.displayName,
			...(p.steamId ? { steamId: p.steamId, href: `/users/${p.steamId}` } : {}),
		}));

	return {
		label,
		players: bracketPlayers.length > 0 ? bracketPlayers : undefined,
		score: score ?? undefined,
		isWinner,
	};
}

// ---------------------------------------------------------------------------
// BYE padding for non-power-of-2 brackets
// ---------------------------------------------------------------------------

function padRoundsWithByes(rounds: BracketRound[]): void {
	for (let i = 0; i < rounds.length - 1; i++) {
		const current = rounds[i];
		const next = rounds[i + 1];
		const expectedCount = next.matches.length * 2;

		if (current.matches.length >= expectedCount) continue;

		const winnerLabels = new Set<string>();
		for (const match of current.matches) {
			const winner = match.side1.isWinner ? match.side1 : match.side2.isWinner ? match.side2 : null;
			if (winner) winnerLabels.add(winner.label);
		}

		const winnerToMatch = new Map<string, BracketMatch>();
		for (const match of current.matches) {
			const winner = match.side1.isWinner ? match.side1 : match.side2.isWinner ? match.side2 : null;
			if (winner) winnerToMatch.set(winner.label, match);
		}

		const padded: BracketMatch[] = [];
		let position = 1;

		for (const nextMatch of next.matches) {
			const s1FromCurrent = winnerLabels.has(nextMatch.side1.label);
			const s2FromCurrent = winnerLabels.has(nextMatch.side2.label);

			if (s1FromCurrent && s2FromCurrent) {
				const m1 = winnerToMatch.get(nextMatch.side1.label);
				const m2 = winnerToMatch.get(nextMatch.side2.label);
				if (m1) padded.push({ ...m1, position: position++ });
				if (m2) padded.push({ ...m2, position: position++ });
			} else if (s1FromCurrent) {
				padded.push(syntheticByeMatch(nextMatch.side2.label, current.number, position++));
				const m = winnerToMatch.get(nextMatch.side1.label);
				if (m) padded.push({ ...m, position: position++ });
			} else if (s2FromCurrent) {
				const m = winnerToMatch.get(nextMatch.side2.label);
				if (m) padded.push({ ...m, position: position++ });
				padded.push(syntheticByeMatch(nextMatch.side1.label, current.number, position++));
			} else {
				padded.push(syntheticByeMatch(nextMatch.side1.label, current.number, position++));
				padded.push(syntheticByeMatch(nextMatch.side2.label, current.number, position++));
			}
		}

		current.matches = padded;
	}
}

let byeIdCounter = 0;

function syntheticByeMatch(playerLabel: string, roundNumber: number, position: number): BracketMatch {
	return {
		id: `bye-${roundNumber}-${++byeIdCounter}`,
		round: roundNumber,
		position,
		side1: { label: playerLabel, isWinner: true },
		side2: { label: 'BYE' },
		status: 'completed',
		isBye: true,
	};
}


// ---------------------------------------------------------------------------
// Round grouping & labeling
// ---------------------------------------------------------------------------

interface RoundGroup {
	roundNum: number;
	matches: MatchRow[];
}

function groupMatchesByRound(matches: MatchRow[], useAbsRound = false): RoundGroup[] {
	const map = new Map<number, MatchRow[]>();

	for (const m of matches) {
		const key = useAbsRound ? Math.abs(m.round ?? 0) : (m.round ?? 0);
		const arr = map.get(key) ?? [];
		arr.push(m);
		map.set(key, arr);
	}

	return Array.from(map.entries())
		.sort(([a], [b]) => a - b)
		.map(([roundNum, roundMatches]) => ({
			roundNum,
			matches: roundMatches.sort((a, b) => a.orderNum - b.orderNum),
		}));
}

function singleElimRoundLabel(index: number, total: number): string {
	const fromEnd = total - index;
	if (fromEnd === 1) return 'Final';
	if (fromEnd === 2) return 'Semifinals';
	if (fromEnd === 3) return 'Quarterfinals';
	return `Round ${index + 1}`;
}

function winnersRoundLabel(index: number, total: number): string {
	const fromEnd = total - index;
	if (fromEnd === 1) return 'Winners Final';
	if (fromEnd === 2) return 'Winners Semifinal';
	return `Winners Round ${index + 1}`;
}

function losersRoundLabel(index: number, total: number): string {
	const fromEnd = total - index;
	if (fromEnd === 1) return 'Losers Final';
	if (fromEnd === 2) return 'Losers Semifinal';
	return `Losers Round ${index + 1}`;
}
