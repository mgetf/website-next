<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import FormError from '$lib/components/ui/form/FormError.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import MarkdownRenderer from '$lib/components/markdown/MarkdownRenderer.svelte';
  import { toast } from '$lib/state/toast.svelte';
  import { formatPlayoffRound } from '$lib/utils/playoffs';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let userComms = $derived(data.match.matchComms.filter((c) => c.owner !== null));

  let showDisputeForm = $state(false);
  let showRescheduleForm = $state(false);
  let showDemoUploadModal = $state(false);
  let showDemoReportModal = $state(false);
  let selectedDemoForReport = $state<any>(null);
  let messageContent = $state('');
  let proposedDateTime = $state('');
  let proposedTimezone = $state('UTC');
  let isSubmittingScore = $state(false);
  let isSubmittingMessage = $state(false);
  let isUploadingDemo = $state(false);
  let isReportingDemo = $state(false);

  // Admin controls
  const TIMEZONES = [
    { value: 'UTC', label: 'UTC' },
    { value: 'America/New_York', label: 'EDT/EST (US East)' },
    { value: 'America/Chicago', label: 'CDT/CST (US Central)' },
    { value: 'America/Denver', label: 'MDT/MST (US Mountain)' },
    { value: 'America/Los_Angeles', label: 'PDT/PST (US West)' },
    { value: 'Europe/London', label: 'BST/GMT (London)' },
    { value: 'Europe/Berlin', label: 'CEST/CET (Central Europe)' },
    { value: 'Europe/Helsinki', label: 'EEST/EET (East Europe)' },
    { value: 'Asia/Singapore', label: 'SGT (Singapore)' },
    { value: 'Asia/Tokyo', label: 'JST (Japan)' },
    { value: 'Australia/Sydney', label: 'AEST/AEDT (Sydney)' },
  ];

  let showAdminEditSchedule = $state(false);
  let showAdminEditArenas = $state(false);
  let showAdminConfirmDelete = $state(false);
  let showAdminEditScores = $state(false);
  let isDeletingMatch = $state(false);
  let isEditingSchedule = $state(false);
  let isEditingArenas = $state(false);
  let isEditingScores = $state(false);

  // Map ban/pick confirmation
  let pendingMapAction = $state<{
    id: number;
    name: string;
    avatar: string | null;
    actionType: 'ban' | 'pick';
  } | null>(null);
  let isConfirmingMapAction = $state(false);

  function openMapActionConfirm(
    arena: { id: number; name: string; avatar: string | null },
    actionType: 'ban' | 'pick',
  ) {
    pendingMapAction = { id: arena.id, name: arena.name, avatar: arena.avatar, actionType };
  }

  let editMatchDateTime = $state('');
  let editMatchTimezone = $state('UTC');
  let editArenas = $state<{ gameId: number; arenaId: string }[]>([]);
  let editScores = $state<{ home: string; away: string }[]>([]);
  let adminEditBoSeriesStr = $state('3');
  let adminResolveDispute = $state(false);
  let localTimeStr = $state<string | null>(null);

  $effect(() => {
    const dt = data.match.matchDateTime;
    const tz = data.match.matchTimezone || 'UTC';
    if (dt) {
      const d = new Date(dt);
      const parts = new Intl.DateTimeFormat('sv', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
        .format(d)
        .replace(' ', 'T');
      editMatchDateTime = parts;
    } else {
      editMatchDateTime = '';
    }
    editMatchTimezone = tz;
  });

  $effect(() => {
    proposedTimezone = data.match.matchTimezone || 'UTC';
  });

  $effect(() => {
    editArenas = data.match.games.map((g) => ({
      gameId: g.id,
      arenaId: g.arenaId ? String(g.arenaId) : '',
    }));
  });

  // Games per arena for the admin editor (1 for regular matches)
  const adminGamesPerArena = () =>
    data.match.boGames && data.match.boGames > 1 ? data.match.boGames : 1;

  function buildEditScores(bo: number, previous: { home: string; away: string }[] = []) {
    const slots = bo * adminGamesPerArena();
    return Array.from({ length: slots }, (_, i) => {
      if (previous[i]) return previous[i];
      const g = data.match.games.find((g) => g.gameNum === i + 1);
      return {
        home: g?.homeTeamScore != null ? String(g.homeTeamScore) : '',
        away: g?.awayTeamScore != null ? String(g.awayTeamScore) : '',
      };
    });
  }

  function openAdminEditScores() {
    const bo = data.match.boSeries || 3;
    adminEditBoSeriesStr = String(bo);
    editScores = buildEditScores(bo);
    adminResolveDispute = false;
    showAdminEditScores = true;
  }

  function onAdminEditBoSeriesChange(v: string) {
    const parsed = parseInt(v, 10);
    const newBo = [1, 3, 5, 7].includes(parsed) ? parsed : 3;
    adminEditBoSeriesStr = String(newBo);
    editScores = buildEditScores(newBo, editScores);
  }

  // Group admin edit-score slots into arenas for multi-arena playoff matches
  const adminScoreArenas = $derived(() => {
    const per = playoffBoGames;
    const bo = parseInt(adminEditBoSeriesStr, 10) || (data.match.boSeries ?? 3);
    const arenas: { arenaIndex: number; arena: ScoreGame['arena']; slotIndices: number[] }[] = [];
    for (let a = 0; a < bo; a++) {
      const slotIndices: number[] = [];
      for (let g = 0; g < per; g++) slotIndices.push(a * per + g);
      const firstGame = data.match.games.find((gm) => gm.gameNum === a * per + 1);
      arenas.push({ arenaIndex: a, arena: firstGame?.arena ?? null, slotIndices });
    }
    return arenas;
  });

  $effect(() => {
    if (data.match.matchDateTime) {
      localTimeStr = new Date(data.match.matchDateTime).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
        hour12: true,
      });
    } else {
      localTimeStr = null;
    }
  });

  // Demo upload state
  let selectedDemoFile = $state<File | null>(null);
  let demoUploadError = $state<string | null>(null);
  let demoUploadProgress = $state<string>('Preparing upload...');

  // Score submission state - track scores as user types (indexed by gameNum - 1)
  let gameScores = $state<{ home: number | null; away: number | null }[]>([]);

  // Playoff series structure.
  // boSeries = number of arenas (maps) in the series.
  // boGames = games played on each arena (playoffs only; regular matches use 1).
  const playoffBoGames = $derived(
    data.match.boGames && data.match.boGames > 1 ? data.match.boGames : 1,
  );
  const seriesArenaCount = $derived(data.match.boSeries || 3);
  const isMultiArena = $derived(playoffBoGames > 1);
  const totalGameSlots = $derived(
    isMultiArena ? seriesArenaCount * playoffBoGames : seriesArenaCount,
  );

  // Initialize gameScores when the match (or its slot count) changes
  $effect(() => {
    const total = totalGameSlots;
    if (gameScores.length !== total) {
      gameScores = Array(total)
        .fill(null)
        .map(() => ({ home: null, away: null }));
    }
  });

  // Calculate games won by each team based on current scores
  const gamesWonByTeam = $derived(() => {
    let homeWins = 0;
    let awayWins = 0;

    for (const game of gameScores) {
      if (game.home !== null && game.away !== null) {
        if (game.home > game.away) homeWins++;
        else if (game.away > game.home) awayWins++;
      }
    }

    return { home: homeWins, away: awayWins };
  });

  // Calculate how many games needed to win the series
  const gamesToWin = $derived(Math.ceil((data.match.boSeries || 3) / 2));

  // Determine if the match is already decided (one team has enough wins)
  const matchDecided = $derived(() => {
    const wins = gamesWonByTeam();
    return wins.home >= gamesToWin || wins.away >= gamesToWin;
  });

  // Determine which game number the match was decided at (first game where a team reached winning threshold)
  const matchDecidedAtGame = $derived(() => {
    let homeWins = 0;
    let awayWins = 0;

    for (let i = 0; i < gameScores.length; i++) {
      const game = gameScores[i];
      if (game.home !== null && game.away !== null) {
        if (game.home > game.away) homeWins++;
        else if (game.away > game.home) awayWins++;

        if (homeWins >= gamesToWin || awayWins >= gamesToWin) {
          return i; // Return the index where match was decided
        }
      }
    }

    return null; // Match not yet decided
  });

  // Check if a specific game should be disabled
  // A game is disabled if:
  // 1. The match is already decided before this game, OR
  // 2. Any previous game hasn't been filled yet (enforce sequential order)
  const isGameDisabled = (gameIndex: number) => {
    // Check if match was decided before this game
    const decidedAt = matchDecidedAtGame();
    if (decidedAt !== null && gameIndex > decidedAt) {
      return true;
    }

    // Check if all previous games are filled (enforce order)
    for (let i = 0; i < gameIndex; i++) {
      const prevGame = gameScores[i];
      if (prevGame?.home === null || prevGame?.away === null) {
        return true; // Previous game not filled, disable this one
      }
    }

    return false;
  };

  const match = $derived(data.match);
  const isUnplayed = $derived(match.status === 'UNPLAYED');
  const isPlayed = $derived(match.status === 'PLAYED');
  const isDisputed = $derived(match.status === 'DISPUTE');

  // Helper to get participant name (player name for 1v1, team name for 2v2)
  const getHomeName = () =>
    match.is1v1 && match.homePlayer ? match.homePlayer.steamUsername : match.homeTeam.name;
  const getAwayName = () =>
    match.is1v1 && match.awayPlayer ? match.awayPlayer.steamUsername : match.awayTeam.name;

  // Get unique arenas with full data (id, name, avatar)
  const matchArenas = $derived(() => {
    const seen = new Set<number>();
    return match.games
      .filter((g) => g.arena && !seen.has(g.arena.id) && seen.add(g.arena.id))
      .map((g) => g.arena!);
  });

  // --- Playoff (multi-arena) score helpers ---
  type ScoreGame = PageData['match']['games'][number];

  const gameWinsPerArena = $derived(Math.ceil(playoffBoGames / 2));
  const arenaWinsNeeded = $derived(Math.ceil(seriesArenaCount / 2));

  // Group the match games into arenas (each a best-of-`playoffBoGames` block)
  const scoreArenas = $derived(() => {
    const arenas: { arenaIndex: number; arena: ScoreGame['arena']; games: ScoreGame[] }[] = [];
    for (let a = 0; a * playoffBoGames < match.games.length; a++) {
      const games = match.games.slice(a * playoffBoGames, a * playoffBoGames + playoffBoGames);
      arenas.push({ arenaIndex: a, arena: games[0]?.arena ?? null, games });
    }
    return arenas;
  });

  // Tally the live result of a single arena from the entered scores
  const arenaResultFor = (arenaIndex: number) => {
    let home = 0;
    let away = 0;
    let decidedAtGame = -1;
    for (let g = 0; g < playoffBoGames; g++) {
      const slot = gameScores[arenaIndex * playoffBoGames + g];
      if (slot && slot.home !== null && slot.away !== null) {
        if (slot.home > slot.away) home++;
        else if (slot.away > slot.home) away++;
        if (decidedAtGame === -1 && (home >= gameWinsPerArena || away >= gameWinsPerArena)) {
          decidedAtGame = g;
        }
      }
    }
    const decided = home >= gameWinsPerArena || away >= gameWinsPerArena;
    const winner: 'home' | 'away' | null = decided ? (home > away ? 'home' : 'away') : null;
    return { home, away, decided, winner, decidedAtGame };
  };

  // Live overall series result (arenas won) for the playoff form
  const playoffProgress = $derived(() => {
    let homeArenas = 0;
    let awayArenas = 0;
    let decidedAtArena = -1;
    for (let a = 0; a < seriesArenaCount; a++) {
      const result = arenaResultFor(a);
      if (result.decided) {
        if (result.winner === 'home') homeArenas++;
        else awayArenas++;
        if (
          decidedAtArena === -1 &&
          (homeArenas >= arenaWinsNeeded || awayArenas >= arenaWinsNeeded)
        ) {
          decidedAtArena = a;
        }
      }
    }
    const decided = homeArenas >= arenaWinsNeeded || awayArenas >= arenaWinsNeeded;
    return { homeArenas, awayArenas, decided, decidedAtArena };
  });

  // Sequential entry guard for a playoff game. Games unlock in order so scores
  // can't be skipped or padded after a result is already decided (which would
  // corrupt the winner/stats math). Returns whether the field is locked and why.
  const playoffGameState = (
    arenaIndex: number,
    gameInArena: number,
  ): { disabled: boolean; reason: string | null } => {
    const progress = playoffProgress();

    // Series already won before reaching this arena
    if (progress.decidedAtArena !== -1 && arenaIndex > progress.decidedAtArena) {
      return { disabled: true, reason: 'Not needed — series already decided' };
    }

    // Earlier arenas must be settled before a later arena opens
    for (let a = 0; a < arenaIndex; a++) {
      if (!arenaResultFor(a).decided) {
        return { disabled: true, reason: `Finish Arena ${a + 1} first` };
      }
    }

    // Arena already won before reaching this game
    const arenaResult = arenaResultFor(arenaIndex);
    if (arenaResult.decidedAtGame !== -1 && gameInArena > arenaResult.decidedAtGame) {
      return { disabled: true, reason: 'Not needed — arena already decided' };
    }

    // Earlier games in this arena must be filled in before the next opens
    for (let g = 0; g < gameInArena; g++) {
      const slot = gameScores[arenaIndex * playoffBoGames + g];
      if (!slot || slot.home === null || slot.away === null) {
        return { disabled: true, reason: 'Enter the previous game first' };
      }
    }

    return { disabled: false, reason: null };
  };

  const canSubmitScores = $derived(
    isUnplayed &&
      (data.permissions.isHomeOwner || data.permissions.isAwayOwner || data.permissions.isAdmin),
  );

  const canDispute = $derived(
    data.canDispute && (data.permissions.isHomeOwner || data.permissions.isAwayOwner),
  );

  type BadgeColor = 'yellow' | 'green' | 'red' | 'zinc';

  const getStatusColor = (status: string): BadgeColor => {
    if (status === 'UNPLAYED') return 'yellow';
    if (status === 'PLAYED') return 'green';
    if (status === 'DISPUTE') return 'red';
    return 'zinc';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'UNPLAYED') return 'Unplayed';
    if (status === 'PLAYED') return 'Played';
    if (status === 'DISPUTE') return 'Disputed';
    return 'Unknown';
  };

  const getPendingRescheduleDisplay = () => {
    const formatted =
      'pendingRescheduleFormatted' in data &&
      typeof data.pendingRescheduleFormatted === 'string' &&
      data.pendingRescheduleFormatted.trim().length > 0
        ? data.pendingRescheduleFormatted
        : null;

    return formatted ?? data.pendingReschedule?.reschedule ?? '';
  };

  // Map ban/pick state
  const mapBanActive = $derived(data.mapBanStatus && !data.mapBanStatus.isComplete && isUnplayed);
  const isUserTurn = $derived(() => {
    if (!mapBanActive || !data.mapBanStatus) return false;
    const currentTurn = data.mapBanStatus.matchMapBan.currentTurn;
    const expectedTeamId = currentTurn === 0 ? match.homeTeamId : match.awayTeamId;

    if (data.permissions.isHomeOwner && expectedTeamId === match.homeTeamId) return true;
    if (data.permissions.isAwayOwner && expectedTeamId === match.awayTeamId) return true;
    return false;
  });

  // Demo modal functions
  const openDemoUploadModal = () => {
    showDemoUploadModal = true;
    selectedDemoFile = null;
    demoUploadError = null;
    demoUploadProgress = 'Preparing upload...';
  };

  const closeDemoUploadModal = () => {
    showDemoUploadModal = false;
    selectedDemoFile = null;
    demoUploadError = null;
  };

  const handleDemoFileSelect = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    selectedDemoFile = file;
    demoUploadError = null;

    // Client-side validation
    if (file) {
      const maxSize = 200 * 1024 * 1024; // 200MB
      if (file.size > maxSize) {
        demoUploadError = `File too large (${formatFileSize(file.size)}). Maximum size is 200MB.`;
        selectedDemoFile = null;
        input.value = '';
      } else if (!file.name.toLowerCase().endsWith('.dem')) {
        demoUploadError = 'Invalid file type. Only .dem files are allowed.';
        selectedDemoFile = null;
        input.value = '';
      }
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const openDemoReportModal = (demo: any) => {
    selectedDemoForReport = demo;
    showDemoReportModal = true;
  };

  const closeDemoReportModal = () => {
    showDemoReportModal = false;
    selectedDemoForReport = null;
  };

  const getDemoReportStatusColor = (status: string): BadgeColor => {
    if (status === 'REVIEW') return 'yellow';
    if (status === 'ACTION') return 'green';
    if (status === 'CLEAR') return 'red';
    return 'zinc';
  };

  const getDemoReportStatusLabel = (status: string) => {
    if (status === 'REVIEW') return 'Pending Review';
    if (status === 'ACTION') return 'Reviewed';
    if (status === 'CLEAR') return 'Rejected';
    return status;
  };

  // Table columns for game results
  const gameResultsColumns = $derived([
    { key: 'game', label: 'Game' },
    { key: 'arena', label: 'Arena' },
    { key: 'homeScore', label: getHomeName(), align: 'center' as const },
    { key: 'awayScore', label: getAwayName(), align: 'center' as const },
    { key: 'winner', label: 'Winner' },
  ]);

  // Filter games to only those with scores
  const playedGames = $derived(
    match.games.filter((g) => g.homeTeamScore !== null && g.awayTeamScore !== null),
  );
</script>

<div class="container mx-auto px-4 py-8 max-w-7xl">
  <!-- Match Header -->
  <Card class="shadow-md mb-6">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-3xl font-bold text-white">
        Match #{match.id}
        {#if data.weekLabel}
          <span class="text-text-body">- Week {data.weekLabel}</span>
        {:else if match.playoffRound}
          <span class="text-text-body">- {formatPlayoffRound(match.playoffRound)}</span>
        {/if}
      </h1>
      <Badge color={getStatusColor(match.status)} size="md" class="px-4 py-2">
        {getStatusLabel(match.status)}
      </Badge>
    </div>

    <!-- Teams/Players -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
      {#if match.is1v1 && match.homePlayer}
        <!-- 1v1: Home Player -->
        <a
          href="/users/{match.homePlayer.steamId}"
          class="flex items-center space-x-4 hover:bg-surface-input p-4 rounded-lg transition"
        >
          <img
            src={match.homePlayer.steamAvatar || '/default-avatar.png'}
            alt={match.homePlayer.steamUsername}
            class="w-16 h-16 rounded-full object-cover"
          />
          <div>
            <div class="font-semibold text-lg text-white flex items-center gap-2">
              {#if match.homePlayer.flagEmoji}
                <span class="leading-none" aria-hidden="true">{match.homePlayer.flagEmoji}</span>
              {/if}
              {match.homePlayer.steamUsername}
            </div>
            <div class="text-sm text-text-body">
              {match.homeTeam.division?.name} &bull; {match.homeTeam.region?.name}
            </div>
          </div>
        </a>
      {:else}
        <!-- 2v2: Home Team -->
        <a
          href="/teams/{match.homeTeamId}"
          class="flex items-center space-x-4 hover:bg-surface-input p-4 rounded-lg transition"
        >
          <img
            src={match.homeTeam.avatar || '/default-avatar.png'}
            alt={match.homeTeam.name}
            class="w-16 h-16 rounded-full object-cover"
          />
          <div>
            <div class="font-semibold text-lg text-white">{match.homeTeam.name}</div>
            <div class="text-sm text-text-body">
              {match.homeTeam.division?.name} &bull; {match.homeTeam.region?.name}
            </div>
          </div>
        </a>
      {/if}

      <!-- Score -->
      <div class="text-center">
        {#if isPlayed || isDisputed}
          <div class="text-4xl font-bold text-white">
            {match.winnerId === match.homeTeamId ? match.winnerScore : match.loserScore}
            <span class="text-text-body">-</span>
            {match.winnerId === match.awayTeamId ? match.winnerScore : match.loserScore}
          </div>
          <div class="text-sm text-text-body mt-2">
            Best of {match.boSeries}
          </div>
        {:else}
          <div class="text-2xl text-text-body">VS</div>
          <div class="text-sm text-text-body mt-2">
            Best of {match.boSeries}
          </div>
        {/if}
      </div>

      {#if match.is1v1 && match.awayPlayer}
        <!-- 1v1: Away Player -->
        <a
          href="/users/{match.awayPlayer.steamId}"
          class="flex items-center space-x-4 hover:bg-surface-input p-4 rounded-lg transition justify-end"
        >
          <div class="text-right">
            <div class="font-semibold text-lg text-white flex items-center justify-end gap-2">
              {#if match.awayPlayer.flagEmoji}
                <span class="leading-none" aria-hidden="true">{match.awayPlayer.flagEmoji}</span>
              {/if}
              {match.awayPlayer.steamUsername}
            </div>
            <div class="text-sm text-text-body">
              {match.awayTeam.division?.name} &bull; {match.awayTeam.region?.name}
            </div>
          </div>
          <img
            src={match.awayPlayer.steamAvatar || '/default-avatar.png'}
            alt={match.awayPlayer.steamUsername}
            class="w-16 h-16 rounded-full object-cover"
          />
        </a>
      {:else}
        <!-- 2v2: Away Team -->
        <a
          href="/teams/{match.awayTeamId}"
          class="flex items-center space-x-4 hover:bg-surface-input p-4 rounded-lg transition justify-end"
        >
          <div class="text-right">
            <div class="font-semibold text-lg text-white">{match.awayTeam.name}</div>
            <div class="text-sm text-text-body">
              {match.awayTeam.division?.name} &bull; {match.awayTeam.region?.name}
            </div>
          </div>
          <img
            src={match.awayTeam.avatar || '/default-avatar.png'}
            alt={match.awayTeam.name}
            class="w-16 h-16 rounded-full object-cover"
          />
        </a>
      {/if}
    </div>

    <!-- Match Info Cards -->
    <div class="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- Season Info -->
      <div class="bg-surface-input/50 rounded-lg p-4 border border-border-input/50">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0"
          >
            <span class="text-purple-400 text-xl">🏆</span>
          </div>
          <div class="flex-1 min-h-[2.5rem] flex flex-col justify-center">
            <p class="text-xs text-text-body uppercase tracking-wide leading-none mb-1">Season</p>
            <p class="text-white font-semibold leading-tight">
              {match.season.region.name} S{match.seasonNo}
            </p>
          </div>
        </div>
      </div>

      <!-- Date/Time Info -->
      <div class="bg-surface-input/50 rounded-lg p-4 border border-border-input/50">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-full bg-info-500/20 flex items-center justify-center flex-shrink-0"
          >
            <span class="text-info-400 text-xl">📅</span>
          </div>
          <div class="flex-1 min-h-[2.5rem] flex flex-col justify-center">
            <p class="text-xs text-text-body uppercase tracking-wide leading-none mb-1">
              Scheduled
            </p>
            {#if match.matchDateTime && match.matchDateTime !== null}
              <p class="text-white font-semibold leading-tight">
                {new Date(match.matchDateTime).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: match.matchTimezone || 'UTC',
                  timeZoneName: 'short',
                  hour12: true,
                })}
              </p>
              {#if localTimeStr}
                <p class="text-xs text-text-muted leading-tight">Your time: {localTimeStr}</p>
              {/if}
            {:else}
              <p class="text-text-body font-medium leading-tight">To Be Determined</p>
            {/if}
          </div>
        </div>
      </div>

      <!-- Submitted By Info (or Not Submitted Warning) -->
      {#if match.submittedBy}
        <div class="bg-surface-input/50 rounded-lg p-4 border border-border-input/50">
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-full bg-success-500/20 flex items-center justify-center flex-shrink-0"
            >
              <span class="text-success-400 text-xl">✓</span>
            </div>
            <div class="flex-1 min-h-[2.5rem] flex flex-col justify-center">
              <p class="text-xs text-text-body uppercase tracking-wide leading-none mb-1">
                Submitted By
              </p>
              <a
                href="/users/{match.submittedBy}"
                class="text-white font-semibold hover:text-primary-400 transition-colors leading-tight"
              >
                {match.submitter?.steamUsername}
              </a>
              {#if match.submittedAt}
                <p class="text-xs text-text-muted leading-tight">
                  {new Date(match.submittedAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'UTC',
                    hour12: true,
                  })} UTC
                </p>
              {/if}
            </div>
          </div>
        </div>
      {:else}
        <div class="bg-surface-input/50 rounded-lg p-4 border border-border-input/50">
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-full bg-warning-500/20 flex items-center justify-center flex-shrink-0"
            >
              <span class="text-warning-400 text-xl">⚠️</span>
            </div>
            <div class="flex-1 min-h-[2.5rem] flex flex-col justify-center">
              <p class="text-xs text-text-body uppercase tracking-wide leading-none mb-1">
                Submitted By
              </p>
              <p class="text-warning-400 font-semibold leading-tight">Awaiting match completion</p>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Arena Cards -->
    {#if matchArenas().length > 0}
      <div class="mt-6">
        <p class="text-xs text-text-body uppercase tracking-wide mb-3">Maps</p>
        <div class="flex flex-wrap gap-3">
          {#each matchArenas() as arena}
            <div
              class="flex items-center gap-3 bg-surface-input/50 rounded-lg px-4 py-3 border border-border-input/50"
            >
              {#if arena.avatar}
                <img src={arena.avatar} alt={arena.name} class="w-10 h-10 rounded object-cover" />
              {:else}
                <div class="w-10 h-10 rounded bg-surface-hover flex items-center justify-center">
                  <span class="text-text-muted text-lg">🗺️</span>
                </div>
              {/if}
              <span class="text-white font-medium">{arena.name}</span>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="mt-6">
        <p class="text-xs text-text-body uppercase tracking-wide mb-3">Maps</p>
        <div class="text-text-muted text-sm">To be determined</div>
      </div>
    {/if}

    <!-- Admin Controls -->
    {#if data.permissions.isAdmin}
      <div class="mt-6 pt-6 border-t border-border-default">
        <p class="text-xs text-text-muted uppercase tracking-wide mb-3">Admin Controls</p>
        <div class="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onclick={() => (showAdminEditSchedule = true)}>
            Edit Schedule
          </Button>
          <Button variant="secondary" size="sm" onclick={() => (showAdminEditArenas = true)}>
            Edit Arenas
          </Button>
          <Button variant="secondary" size="sm" onclick={openAdminEditScores}>Edit Scores</Button>
          {#if isUnplayed}
            <Button variant="danger" size="sm" onclick={() => (showAdminConfirmDelete = true)}>
              Delete Match
            </Button>
          {/if}
        </div>
      </div>
    {/if}
  </Card>

  <!-- Score Submission Form -->
  {#if canSubmitScores}
    <Card class="shadow-md mb-6">
      <h2 class="text-2xl font-bold text-white mb-4">Submit Match Scores</h2>

      <form
        method="POST"
        action="?/submitScores"
        use:enhance={() => {
          isSubmittingScore = true;

          return async ({ result, update }) => {
            isSubmittingScore = false;

            if (result.type === 'failure') {
              const errorData = result.data as { error?: string } | undefined;
              toast.error(errorData?.error || 'Failed to submit scores');
            } else if (result.type === 'success') {
              toast.success('Scores submitted successfully!');
            }

            await update();
          };
        }}
      >
        <!-- Team column headers -->
        <div class="grid grid-cols-3 gap-4 items-center mb-5 pb-4 border-b border-border-input">
          <div class="flex items-center gap-3">
            <img
              src={match.is1v1 && match.homePlayer
                ? match.homePlayer.steamAvatar || '/default-avatar.png'
                : match.homeTeam.avatar || '/default-avatar.png'}
              alt={getHomeName()}
              class="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />
            <div>
              <p class="font-semibold text-white">{getHomeName()}</p>
              {#if data.permissions.isHomeOwner}
                <p class="text-xs text-info-400 font-medium">You</p>
              {:else}
                <p class="text-xs text-text-muted">Home</p>
              {/if}
            </div>
          </div>
          <div></div>
          <div class="flex items-center gap-3 justify-end">
            <div class="text-right">
              <p class="font-semibold text-white">{getAwayName()}</p>
              {#if data.permissions.isAwayOwner}
                <p class="text-xs text-info-400 font-medium">You</p>
              {:else}
                <p class="text-xs text-text-muted">Away</p>
              {/if}
            </div>
            <img
              src={match.is1v1 && match.awayPlayer
                ? match.awayPlayer.steamAvatar || '/default-avatar.png'
                : match.awayTeam.avatar || '/default-avatar.png'}
              alt={getAwayName()}
              class="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />
          </div>
        </div>

        {#if isMultiArena}
          <!-- Playoff: best-of-arenas, each arena a best-of-games sub-series -->
          <div class="space-y-6">
            {#each scoreArenas() as group (group.arenaIndex)}
              {@const arenaResult = arenaResultFor(group.arenaIndex)}
              <div class="border border-border-input rounded-lg overflow-hidden">
                <div
                  class="flex items-center gap-3 bg-surface-input/60 px-4 py-3 border-b border-border-input"
                >
                  {#if group.arena?.avatar}
                    <img
                      src={group.arena.avatar}
                      alt={group.arena.name}
                      class="w-9 h-9 rounded object-cover flex-shrink-0"
                    />
                  {:else}
                    <div
                      class="w-9 h-9 rounded bg-surface-hover flex items-center justify-center flex-shrink-0"
                    >
                      <span class="text-text-muted">🗺️</span>
                    </div>
                  {/if}
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-text-muted uppercase tracking-wide">
                      Arena {group.arenaIndex + 1}
                    </p>
                    <p class="font-semibold text-white truncate">
                      {group.arena?.name ?? 'To be determined'}
                    </p>
                  </div>
                  <span class="text-xs text-text-body whitespace-nowrap"
                    >Best of {playoffBoGames}</span
                  >
                  {#if arenaResult.decided}
                    <Badge color="green" size="sm">
                      {arenaResult.winner === 'home' ? getHomeName() : getAwayName()}
                      {Math.max(arenaResult.home, arenaResult.away)}–{Math.min(
                        arenaResult.home,
                        arenaResult.away,
                      )}
                    </Badge>
                  {/if}
                </div>
                <div class="p-4 space-y-3">
                  {#each group.games as game, gameInArena (game.id)}
                    {@const slotIndex = game.gameNum - 1}
                    {@const gameState = playoffGameState(group.arenaIndex, gameInArena)}
                    {@const disabled = gameState.disabled}
                    <div class={disabled ? 'opacity-50' : ''}>
                      <div class="flex items-center justify-between mb-2">
                        <h4 class="text-sm font-medium text-text-label">Game {gameInArena + 1}</h4>
                        {#if disabled && gameState.reason}
                          <span class="text-xs text-text-muted bg-surface-input px-2 py-1 rounded">
                            {gameState.reason}
                          </span>
                        {/if}
                      </div>
                      <div class="grid grid-cols-3 gap-4 items-center">
                        <div>
                          <label for="homeScore-{slotIndex}" class="sr-only"
                            >{getHomeName()} score</label
                          >
                          <input
                            id="homeScore-{slotIndex}"
                            type="number"
                            name="homeScore_{slotIndex}"
                            min="0"
                            {disabled}
                            value={gameScores[slotIndex]?.home ?? ''}
                            oninput={(e) => {
                              const val = e.currentTarget.value;
                              if (gameScores[slotIndex]) {
                                gameScores[slotIndex].home = val === '' ? null : parseInt(val);
                              }
                            }}
                            class="w-full bg-surface-input border border-border-input text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:cursor-not-allowed disabled:bg-surface-card disabled:text-text-muted"
                          />
                        </div>
                        <div class="text-center text-text-body font-semibold">VS</div>
                        <div>
                          <label for="awayScore-{slotIndex}" class="sr-only"
                            >{getAwayName()} score</label
                          >
                          <input
                            id="awayScore-{slotIndex}"
                            type="number"
                            name="awayScore_{slotIndex}"
                            min="0"
                            {disabled}
                            value={gameScores[slotIndex]?.away ?? ''}
                            oninput={(e) => {
                              const val = e.currentTarget.value;
                              if (gameScores[slotIndex]) {
                                gameScores[slotIndex].away = val === '' ? null : parseInt(val);
                              }
                            }}
                            class="w-full bg-surface-input border border-border-input text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:cursor-not-allowed disabled:bg-surface-card disabled:text-text-muted"
                          />
                        </div>
                      </div>
                      {#if game.arena}
                        <input type="hidden" name="arenaId_{slotIndex}" value={game.arena.id} />
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>

          <!-- Match status indicator (playoff) -->
          {#if playoffProgress().decided}
            {@const progress = playoffProgress()}
            <div class="mt-4 p-3 bg-success-500/20 border border-success-500/30 rounded-lg">
              <p class="text-success-400 text-sm">
                &#10003; Match decided: <strong
                  >{progress.homeArenas >= arenaWinsNeeded ? getHomeName() : getAwayName()}</strong
                >
                wins {Math.max(progress.homeArenas, progress.awayArenas)}-{Math.min(
                  progress.homeArenas,
                  progress.awayArenas,
                )} arenas
              </p>
            </div>
          {/if}
        {:else}
          <div class="space-y-4">
            {#each Array(match.boSeries || 3) as _, i}
              {@const disabled = isGameDisabled(i)}
              {@const decidedAt = matchDecidedAtGame()}
              {@const isMatchDecidedBefore = decidedAt !== null && i > decidedAt}
              <div class="border border-border-input rounded-lg p-4 {disabled ? 'opacity-50' : ''}">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold text-white">Game {i + 1}</h3>
                  {#if disabled}
                    <span class="text-xs text-text-muted bg-surface-input px-2 py-1 rounded">
                      {isMatchDecidedBefore
                        ? 'Not needed - match already decided'
                        : 'Fill previous games first'}
                    </span>
                  {/if}
                </div>
                <div class="grid grid-cols-3 gap-4 items-center">
                  <div>
                    <label for="homeScore-{i}" class="sr-only">{getHomeName()} score</label>
                    <input
                      id="homeScore-{i}"
                      type="number"
                      name="homeScore_{i}"
                      min="0"
                      required={!disabled}
                      {disabled}
                      value={gameScores[i]?.home ?? ''}
                      oninput={(e) => {
                        const val = e.currentTarget.value;
                        if (gameScores[i]) {
                          gameScores[i].home = val === '' ? null : parseInt(val);
                        }
                      }}
                      class="w-full bg-surface-input border border-border-input text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:cursor-not-allowed disabled:bg-surface-card disabled:text-text-muted"
                    />
                  </div>
                  <div class="text-center text-text-body font-semibold">VS</div>
                  <div>
                    <label for="awayScore-{i}" class="sr-only">{getAwayName()} score</label>
                    <input
                      id="awayScore-{i}"
                      type="number"
                      name="awayScore_{i}"
                      min="0"
                      required={!disabled}
                      {disabled}
                      value={gameScores[i]?.away ?? ''}
                      oninput={(e) => {
                        const val = e.currentTarget.value;
                        if (gameScores[i]) {
                          gameScores[i].away = val === '' ? null : parseInt(val);
                        }
                      }}
                      class="w-full bg-surface-input border border-border-input text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:cursor-not-allowed disabled:bg-surface-card disabled:text-text-muted"
                    />
                  </div>
                </div>
                {#if !data.mapBanStatus || data.mapBanStatus.isComplete}
                  {@const gameArena = match.games[i]?.arena}
                  {@const defaultArenaId =
                    gameArena?.id ?? (matchArenas().length === 1 ? matchArenas()[0].id : null)}
                  <div class="mt-3">
                    <label for="arenaId-{i}" class="block text-sm font-medium text-text-label mb-1"
                      >Arena/Map</label
                    >
                    <select
                      id="arenaId-{i}"
                      name="arenaId_{i}"
                      {disabled}
                      class="w-full bg-surface-input border border-border-input text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:cursor-not-allowed disabled:bg-surface-card disabled:text-text-muted"
                    >
                      {#each matchArenas() as arena}
                        <option value={arena.id} selected={defaultArenaId === arena.id}
                          >{arena.name}</option
                        >
                      {/each}
                    </select>
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          <!-- Match status indicator -->
          {#if matchDecided()}
            {@const wins = gamesWonByTeam()}
            <div class="mt-4 p-3 bg-success-500/20 border border-success-500/30 rounded-lg">
              <p class="text-success-400 text-sm">
                &#10003; Match decided: <strong
                  >{wins.home >= gamesToWin ? getHomeName() : getAwayName()}</strong
                >
                wins {Math.max(wins.home, wins.away)}-{Math.min(wins.home, wins.away)}
              </p>
            </div>
          {/if}
        {/if}
        <div class="mt-6">
          <Button type="submit" variant="success" size="lg" disabled={isSubmittingScore}>
            {isSubmittingScore ? 'Submitting...' : 'Submit Scores'}
          </Button>
        </div>
      </form>
    </Card>
  {/if}

  <!-- Game Results (if played) -->
  {#if (isPlayed || isDisputed) && match.games.some((g) => g.homeTeamScore !== null)}
    <Card class="shadow-md mb-6">
      <h2 class="text-2xl font-bold text-white mb-4">Game Results</h2>

      <DataTable data={playedGames} columns={gameResultsColumns}>
        {#snippet cell(game, col)}
          {#if col.key === 'game'}
            <span class="font-semibold">Game {game.gameNum}</span>
          {:else if col.key === 'arena'}
            {game.arena?.name || 'N/A'}
          {:else if col.key === 'homeScore'}
            <span
              class={(game.homeTeamScore ?? 0) > (game.awayTeamScore ?? 0)
                ? 'font-bold text-success-400'
                : ''}
            >
              {game.homeTeamScore}
            </span>
          {:else if col.key === 'awayScore'}
            <span
              class={(game.awayTeamScore ?? 0) > (game.homeTeamScore ?? 0)
                ? 'font-bold text-success-400'
                : ''}
            >
              {game.awayTeamScore}
            </span>
          {:else if col.key === 'winner'}
            {#if (game.homeTeamScore ?? 0) > (game.awayTeamScore ?? 0)}
              {getHomeName()}
            {:else if (game.awayTeamScore ?? 0) > (game.homeTeamScore ?? 0)}
              {getAwayName()}
            {:else}
              Tie
            {/if}
          {/if}
        {/snippet}
      </DataTable>

      {#if canDispute && data.disputeTimeRemaining}
        <div class="mt-4 p-4 bg-warning-500/20 border border-warning-500/30 rounded-lg">
          <div class="flex items-center justify-between">
            <div>
              <p class="font-semibold text-warning-400">Dispute Period</p>
              <p class="text-sm text-warning-400">
                Time remaining: <span class="font-mono">{data.disputeTimeRemaining}</span>
              </p>
            </div>
            <Button
              type="button"
              variant="warning"
              onclick={() => (showDisputeForm = !showDisputeForm)}
            >
              File Dispute
            </Button>
          </div>
        </div>
      {/if}
    </Card>
  {/if}

  <!-- Dispute Form -->
  {#if showDisputeForm}
    <Card class="shadow-md mb-6">
      <h2 class="text-2xl font-bold text-white mb-4">File Match Dispute</h2>
      <form method="POST" action="?/dispute" use:enhance>
        <div class="mb-4">
          <label for="disputeReason" class="block text-sm font-medium text-text-label mb-2"
            >Dispute Reason</label
          >
          <textarea
            id="disputeReason"
            name="reason"
            rows="4"
            required
            placeholder="Explain why you are disputing this match..."
            class="w-full bg-surface-input border border-border-input text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          ></textarea>
        </div>
        <div class="flex space-x-3">
          <Button type="submit" variant="danger" size="lg">Submit Dispute</Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onclick={() => (showDisputeForm = false)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  {/if}

  <!-- Map Ban/Pick Interface -->
  {#if mapBanActive && data.mapBanStatus}
    <Card class="shadow-md mb-6">
      <h2 class="text-2xl font-bold text-white mb-4">Map Ban/Pick Phase</h2>

      <div class="mb-6">
        <div class="text-sm text-text-label mb-2">
          Current Turn: <span class="font-semibold">
            {data.mapBanStatus.matchMapBan.currentTurn === 0 ? getHomeName() : getAwayName()}
          </span>
        </div>
        <div class="text-sm text-text-label">
          Next Action: <span class="font-semibold uppercase">{data.mapBanStatus.nextAction}</span>
        </div>
      </div>

      <!-- Available Maps -->
      {#if isUserTurn()}
        <div class="mb-6">
          <h3 class="font-semibold text-white mb-3">Available Maps</h3>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {#each data.mapBanStatus.availableArenas as mapInPool}
              <button
                type="button"
                onclick={() =>
                  openMapActionConfirm(
                    mapInPool.arena,
                    data.mapBanStatus?.nextAction === 'ban' ? 'ban' : 'pick',
                  )}
                class="w-full overflow-hidden border-2 border-border-input rounded-lg hover:border-primary-500 hover:bg-primary-500/10 transition text-left"
              >
                {#if mapInPool.arena.avatar}
                  <img
                    src={mapInPool.arena.avatar}
                    alt={mapInPool.arena.name}
                    class="w-full h-24 object-cover"
                  />
                {:else}
                  <div class="w-full h-24 bg-surface-hover flex items-center justify-center">
                    <span class="text-2xl text-text-muted">🗺️</span>
                  </div>
                {/if}
                <div class="p-3">
                  <div class="font-semibold">{mapInPool.arena.name}</div>
                  <div class="text-xs text-text-body mt-1 uppercase">
                    {data.mapBanStatus.nextAction}
                  </div>
                </div>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Ban/Pick History -->
      <div class="mt-6">
        <h3 class="font-semibold text-white mb-3">Action History</h3>
        <div class="space-y-2">
          {#each data.mapBanStatus.matchMapBan.actions as action}
            <div class="flex items-center space-x-3 p-3 bg-surface-input rounded-lg">
              <span
                class="px-2 py-1 rounded text-xs font-semibold {action.actionType === 'BAN'
                  ? 'bg-danger-500/10 text-danger-300'
                  : 'bg-success-500/10 text-success-300'}"
              >
                {action.actionType}
              </span>
              <span class="font-medium">{action.team?.name || 'Unknown'}</span>
              <span class="text-text-label"
                >{action.actionType === 'BAN' ? 'banned' : 'picked'}</span
              >
              <span class="font-semibold">{action.arena?.name || 'Unknown'}</span>
            </div>
          {/each}
        </div>
      </div>
    </Card>
  {/if}

  <!-- Match Communications -->
  <Card class="shadow-md mb-6">
    <h2 class="text-2xl font-bold text-white mb-4">Match Communications</h2>

    <!-- Pending Reschedule Alert -->
    {#if data.pendingReschedule && data.canReschedule && data.permissions.canManage}
      <div class="mb-6 p-4 bg-info-500/20 border border-info-500/30 rounded-lg">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-semibold text-info-400">Reschedule Request Pending</p>
            <p class="text-sm text-info-400">
              Proposed: {getPendingRescheduleDisplay()}
            </p>
            {#if data.rescheduleTimeRemaining}
              <p class="text-xs text-info-400 mt-1">
                Time to respond: <span class="font-mono">{data.rescheduleTimeRemaining}</span>
              </p>
            {/if}
          </div>
          {#if data.hasPendingReschedule}
            <div class="flex space-x-2">
              <form method="POST" action="?/respondReschedule" use:enhance>
                <input type="hidden" name="commId" value={data.pendingReschedule.id} />
                <input type="hidden" name="response" value="accept" />
                <Button type="submit" variant="success" size="sm">Accept</Button>
              </form>
              <form method="POST" action="?/respondReschedule" use:enhance>
                <input type="hidden" name="commId" value={data.pendingReschedule.id} />
                <input type="hidden" name="response" value="deny" />
                <Button type="submit" variant="danger" size="sm">Deny</Button>
              </form>
            </div>
          {:else if data.user && data.pendingReschedule.owner === data.user.steamId}
            <form method="POST" action="?/respondReschedule" use:enhance>
              <input type="hidden" name="commId" value={data.pendingReschedule.id} />
              <input type="hidden" name="response" value="cancel" />
              <Button type="submit" variant="secondary" size="sm">Cancel Request</Button>
            </form>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Message Form -->
    {#if data.permissions.canManage}
      <div class="mb-6 p-4 bg-surface-input rounded-lg">
        <form
          method="POST"
          action="?/postMessage"
          use:enhance={() => {
            isSubmittingMessage = true;
            return async ({ result, update }) => {
              isSubmittingMessage = false;
              if (result.type === 'success') {
                messageContent = '';
              }
              await update();
            };
          }}
        >
          <div class="mb-3">
            <textarea
              name="content"
              bind:value={messageContent}
              rows="3"
              placeholder="Write your message..."
              disabled={isSubmittingMessage}
              class="w-full bg-surface-input border border-border-input text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            ></textarea>
          </div>
          <div class="flex gap-3">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={messageContent.trim().length === 0 || isSubmittingMessage}
            >
              {isSubmittingMessage ? 'Posting...' : 'Post Message'}
            </Button>
            {#if data.canReschedule && !data.pendingReschedule}
              <Button
                type="button"
                variant="primary"
                size="sm"
                onclick={() => (showRescheduleForm = !showRescheduleForm)}
              >
                {showRescheduleForm ? 'Cancel Reschedule' : 'Request Reschedule'}
              </Button>
            {/if}
          </div>
        </form>
      </div>

      <!-- Reschedule Form -->
      {#if showRescheduleForm && data.canReschedule && !data.pendingReschedule}
        <div class="mb-6 p-4 bg-surface-input rounded-lg">
          <form method="POST" action="?/requestReschedule" use:enhance>
            <FormInput
              label={`Proposed Date/Time (${proposedTimezone})`}
              type="datetime-local"
              name="proposedDateTime"
              bind:value={proposedDateTime}
              required
              hint={`Enter the date and time in ${proposedTimezone}.`}
            />
            <FormSelect
              label="Timezone"
              name="proposedTimezone"
              bind:value={proposedTimezone}
              options={TIMEZONES}
              required
            />
            <Button type="submit" variant="primary" size="sm">Send Request</Button>
          </form>
        </div>
      {/if}
    {/if}

    <!-- Messages -->
    <div class="space-y-3">
      {#each userComms as comm, index}
        <div class="p-4 bg-surface-input rounded-lg">
          <div class="flex items-start space-x-3">
            <div class="flex-shrink-0">
              <span
                class="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-xs font-semibold text-text-label"
              >
                #{userComms.length - index + 1}
              </span>
            </div>
            <img
              src={comm.user?.steamAvatar || '/default-avatar.png'}
              alt={comm.user?.steamUsername || 'Unknown'}
              class="w-10 h-10 rounded-full"
            />
            <div class="flex-1">
              <div class="flex items-center space-x-2">
                <a
                  href="/users/{comm.owner}"
                  class="font-semibold text-white hover:text-primary-400"
                >
                  {comm.user?.steamUsername || 'Unknown'}
                </a>
                {#if comm.createdAt}
                  <span class="text-xs text-text-body">
                    {new Date(comm.createdAt).toLocaleString()}
                  </span>
                {:else}
                  <span class="text-xs text-text-muted italic"> No timestamp </span>
                {/if}
              </div>
              <div class="mt-1">
                <MarkdownRenderer content={comm.content ?? ''} class="text-text-label" />
              </div>
            </div>
          </div>
        </div>
      {/each}

      <!-- System message, always #1 at the bottom -->
      <div class="p-4 bg-surface-input rounded-lg">
        <div class="flex items-start space-x-3">
          <div class="flex-shrink-0">
            <span
              class="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-xs font-semibold text-text-label"
            >
              #1
            </span>
          </div>
          <img src="/mge_transparent_logo.png" alt="System" class="w-10 h-10 rounded-full" />
          <div class="flex-1">
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-text-body">System</span>
            </div>
            <div class="mt-1">
              <MarkdownRenderer content={data.matchCreatedMessage} class="text-text-label" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </Card>

  <!-- Demos Section -->
  <Card class="shadow-md">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-2xl font-bold text-white">Match Demos</h2>
      {#if data.canUploadDemo}
        <Button type="button" variant="primary" size="sm" onclick={openDemoUploadModal}>
          Upload Demo
        </Button>
      {/if}
    </div>

    {#if match.demos && match.demos.length > 0}
      <div class="space-y-3">
        {#each match.demos as demo}
          <div class="p-4 bg-surface-input rounded-lg">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center space-x-3 mb-2">
                  {#if demo.player}
                    <img
                      src={demo.player.steamAvatar}
                      alt={demo.player.steamUsername}
                      class="w-8 h-8 rounded-full"
                    />
                    <div>
                      <a
                        href="/users/{demo.playerSteamId}"
                        class="font-semibold text-white hover:text-primary-400"
                      >
                        {demo.player.steamUsername}
                      </a>
                      <span class="text-text-body text-sm">'s Demo</span>
                    </div>
                  {:else}
                    <div class="font-semibold text-white">Demo File</div>
                  {/if}
                </div>
                <div class="text-sm text-text-label mb-1">
                  Submitted by <a
                    href="/users/{demo.submittedBy}"
                    class="text-info-400 hover:underline"
                  >
                    {demo.submitter?.steamUsername}
                  </a>
                  • {new Date(demo.submittedAt).toLocaleDateString()}
                </div>
                {#if demo.description}
                  <p class="text-sm text-text-label mt-2">{demo.description}</p>
                {/if}

                {#if data.user && data.userDemoReports[demo.id] && data.userDemoReports[demo.id].length > 0}
                  <div class="mt-3 flex flex-wrap gap-2">
                    {#each data.userDemoReports[demo.id] as report}
                      <Badge color={getDemoReportStatusColor(report.status)} size="md">
                        Your Report: {getDemoReportStatusLabel(report.status)}
                      </Badge>
                    {/each}
                  </div>
                {/if}
              </div>

              <div class="flex items-center space-x-2 ml-4">
                <Button href={demo.file} variant="primary" size="sm" target="_blank">
                  Download
                </Button>
                {#if data.user}
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onclick={() => openDemoReportModal(demo)}
                  >
                    Report
                  </Button>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <p class="text-text-body text-center py-8">No demos have been uploaded for this match yet.</p>
    {/if}
  </Card>
</div>

<!-- Admin: Edit Schedule Dialog -->
<Dialog
  open={showAdminEditSchedule}
  title="Edit Match Schedule"
  onClose={() => (showAdminEditSchedule = false)}
>
  <FormError error={form?.error} success={form?.success ? form.message : null} />
  <form
    method="POST"
    action="?/adminEditSchedule"
    use:enhance={() => {
      isEditingSchedule = true;
      return async ({ result, update }) => {
        isEditingSchedule = false;
        if (result.type === 'success') {
          showAdminEditSchedule = false;
          toast.success('Schedule updated');
        } else if (result.type === 'failure') {
          const d = result.data as { error?: string } | undefined;
          toast.error(d?.error || 'Failed to update schedule');
        }
        await update();
      };
    }}
  >
    <div class="mb-4">
      <label for="adminMatchDateTime" class="block text-sm font-medium text-text-label mb-2">
        Date &amp; Time <span class="text-text-muted text-xs">(in the timezone below)</span>
      </label>
      <input
        id="adminMatchDateTime"
        type="datetime-local"
        name="matchDateTime"
        bind:value={editMatchDateTime}
        class="w-full px-4 py-3 bg-surface-input border border-border-input rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
      />
    </div>
    <FormSelect
      label="Timezone"
      name="matchTimezone"
      bind:value={editMatchTimezone}
      options={TIMEZONES}
    />
    <p class="text-xs text-text-muted mt-2 mb-4">
      Enter the date and time in the selected timezone. Leave the date blank to set the schedule to
      TBD.
    </p>
    <div class="flex justify-end gap-3">
      <Button
        type="button"
        variant="secondary"
        onclick={() => (showAdminEditSchedule = false)}
        disabled={isEditingSchedule}
      >
        Cancel
      </Button>
      <Button type="submit" variant="primary" disabled={isEditingSchedule}>
        {isEditingSchedule ? 'Saving...' : 'Save Schedule'}
      </Button>
    </div>
  </form>
</Dialog>

<!-- Admin: Edit Arenas Dialog -->
<Dialog
  open={showAdminEditArenas}
  title="Edit Match Arenas"
  onClose={() => (showAdminEditArenas = false)}
>
  <FormError error={form?.error} success={form?.success ? form.message : null} />
  <form
    method="POST"
    action="?/adminEditArenas"
    use:enhance={() => {
      isEditingArenas = true;
      return async ({ result, update }) => {
        isEditingArenas = false;
        if (result.type === 'success') {
          showAdminEditArenas = false;
          toast.success('Arenas updated');
        } else if (result.type === 'failure') {
          const d = result.data as { error?: string } | undefined;
          toast.error(d?.error || 'Failed to update arenas');
        }
        await update();
      };
    }}
  >
    {#each editArenas as entry, i}
      <input type="hidden" name="gameId" value={entry.gameId} />
      <FormSelect
        label="Game {i + 1} Arena"
        name="arenaId"
        bind:value={entry.arenaId}
        options={[
          { value: '', label: '— None —' },
          ...data.arenas.map((a) => ({ value: String(a.id), label: a.name })),
        ]}
      />
    {/each}
    <div class="flex justify-end gap-3 mt-4">
      <Button
        type="button"
        variant="secondary"
        onclick={() => (showAdminEditArenas = false)}
        disabled={isEditingArenas}
      >
        Cancel
      </Button>
      <Button type="submit" variant="primary" disabled={isEditingArenas}>
        {isEditingArenas ? 'Saving...' : 'Save Arenas'}
      </Button>
    </div>
  </form>
</Dialog>

<!-- Admin: Delete Match Confirmation -->
<ConfirmDialog
  open={showAdminConfirmDelete}
  title="Delete Match"
  description="This will permanently delete match #{match.id} and all related data (games, comms, map bans). This action cannot be undone."
  variant="danger"
  confirmLabel="Delete Match"
  isLoading={isDeletingMatch}
  onConfirm={() => {
    const deleteForm = document.getElementById('adminDeleteMatchForm') as HTMLFormElement | null;
    deleteForm?.requestSubmit();
  }}
  onCancel={() => (showAdminConfirmDelete = false)}
/>

<form
  id="adminDeleteMatchForm"
  method="POST"
  action="?/adminDeleteMatch"
  class="hidden"
  use:enhance={() => {
    isDeletingMatch = true;
    return async ({ result, update }) => {
      isDeletingMatch = false;
      if (result.type === 'redirect') {
        showAdminConfirmDelete = false;
      } else if (result.type === 'failure') {
        showAdminConfirmDelete = false;
        const d = result.data as { error?: string } | undefined;
        toast.error(d?.error || 'Failed to delete match');
      }
      await update();
    };
  }}
></form>

<!-- Map Ban/Pick Confirmation -->
<form
  id="mapActionForm"
  method="POST"
  action="?/mapAction"
  class="hidden"
  use:enhance={() => {
    isConfirmingMapAction = true;
    return async ({ result, update }) => {
      isConfirmingMapAction = false;
      if (result.type === 'success') {
        pendingMapAction = null;
      } else if (result.type === 'failure') {
        const d = result.data as { error?: string } | undefined;
        toast.error(d?.error || 'Failed to process map action');
      }
      await update();
    };
  }}
>
  <input type="hidden" name="arenaId" value={pendingMapAction?.id ?? ''} />
  <input type="hidden" name="actionType" value={pendingMapAction?.actionType ?? ''} />
</form>

<ConfirmDialog
  open={pendingMapAction !== null}
  title={`${pendingMapAction?.actionType === 'ban' ? 'Ban' : 'Pick'} ${pendingMapAction?.name ?? ''}?`}
  description={pendingMapAction?.actionType === 'ban'
    ? `Are you sure you want to ban ${pendingMapAction?.name}? This removes it from the pool and cannot be undone.`
    : `Are you sure you want to pick ${pendingMapAction?.name}? This map will be added to the match and cannot be undone.`}
  variant={pendingMapAction?.actionType === 'ban' ? 'danger' : 'info'}
  confirmLabel={pendingMapAction?.actionType === 'ban' ? 'Ban Map' : 'Pick Map'}
  isLoading={isConfirmingMapAction}
  onConfirm={() => {
    const mapForm = document.getElementById('mapActionForm') as HTMLFormElement | null;
    mapForm?.requestSubmit();
  }}
  onCancel={() => (pendingMapAction = null)}
>
  {#snippet preview()}
    <div class="flex items-center gap-3">
      {#if pendingMapAction?.avatar}
        <img
          src={pendingMapAction.avatar}
          alt={pendingMapAction.name}
          class="w-16 h-16 rounded object-cover flex-shrink-0"
        />
      {:else}
        <div
          class="w-16 h-16 rounded bg-surface-hover flex items-center justify-center flex-shrink-0"
        >
          <span class="text-2xl text-text-muted">🗺️</span>
        </div>
      {/if}
      <div>
        <p class="font-semibold text-white">{pendingMapAction?.name}</p>
        <p class="text-xs text-text-body uppercase">{pendingMapAction?.actionType}</p>
      </div>
    </div>
  {/snippet}
</ConfirmDialog>

<!-- Admin: Edit Scores Dialog -->
<Dialog
  open={showAdminEditScores}
  title="Edit Match Scores"
  onClose={() => (showAdminEditScores = false)}
>
  <FormError error={form?.error} success={form?.success ? form.message : null} />
  <form
    method="POST"
    action="?/adminUpdateScores"
    use:enhance={() => {
      isEditingScores = true;
      return async ({ result, update }) => {
        isEditingScores = false;
        if (result.type === 'success') {
          showAdminEditScores = false;
          toast.success('Scores updated');
        } else if (result.type === 'failure') {
          const d = result.data as { error?: string } | undefined;
          toast.error(d?.error || 'Failed to update scores');
        }
        await update();
      };
    }}
  >
    {#if isMultiArena}
      <input type="hidden" name="boSeries" value={adminEditBoSeriesStr} />
    {:else}
      <div class="mb-4">
        <FormSelect
          label="Best of series"
          name="boSeries"
          bind:value={adminEditBoSeriesStr}
          required
          placeholder="Select"
          options={[
            { value: '1', label: 'Bo1' },
            { value: '3', label: 'Bo3' },
            { value: '5', label: 'Bo5' },
            { value: '7', label: 'Bo7' },
          ]}
          hint="Changing this adds or removes game slots. Lowering Best of is blocked if dropped games still have scores."
          onChange={onAdminEditBoSeriesChange}
        />
      </div>
    {/if}

    <div class="grid grid-cols-3 gap-4 items-center mb-4 pb-3 border-b border-border-input">
      <p class="text-sm font-medium text-text-label">{getHomeName()}</p>
      <p class="text-sm font-medium text-text-muted text-center">vs</p>
      <p class="text-sm font-medium text-text-label text-right">{getAwayName()}</p>
    </div>

    {#if isMultiArena}
      <div class="space-y-4 mb-4">
        {#each adminScoreArenas() as group (group.arenaIndex)}
          <div class="border border-border-input rounded-lg p-3">
            <p class="text-sm font-semibold text-white mb-2">
              Arena {group.arenaIndex + 1}{group.arena ? ` — ${group.arena.name}` : ''}
            </p>
            <div class="space-y-2">
              {#each group.slotIndices as slotIndex, gameInArena (slotIndex)}
                {#if editScores[slotIndex]}
                  <div class="grid grid-cols-3 gap-4 items-center">
                    <div>
                      <label for="adminHomeScore-{slotIndex}" class="sr-only"
                        >{getHomeName()} score, game {slotIndex + 1}</label
                      >
                      <input
                        id="adminHomeScore-{slotIndex}"
                        type="number"
                        name="homeScore_{slotIndex}"
                        min="0"
                        bind:value={editScores[slotIndex].home}
                        placeholder="0"
                        class="w-full px-3 py-2 bg-surface-input border border-border-input rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                      />
                    </div>
                    <p class="text-text-muted text-center text-sm">Game {gameInArena + 1}</p>
                    <div>
                      <label for="adminAwayScore-{slotIndex}" class="sr-only"
                        >{getAwayName()} score, game {slotIndex + 1}</label
                      >
                      <input
                        id="adminAwayScore-{slotIndex}"
                        type="number"
                        name="awayScore_{slotIndex}"
                        min="0"
                        bind:value={editScores[slotIndex].away}
                        placeholder="0"
                        class="w-full px-3 py-2 bg-surface-input border border-border-input rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                      />
                    </div>
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="space-y-3 mb-4">
        {#each editScores as entry, i}
          <div class="grid grid-cols-3 gap-4 items-center">
            <div>
              <label for="adminHomeScore-{i}" class="sr-only"
                >{getHomeName()} score, game {i + 1}</label
              >
              <input
                id="adminHomeScore-{i}"
                type="number"
                name="homeScore_{i}"
                min="0"
                bind:value={entry.home}
                placeholder="0"
                class="w-full px-3 py-2 bg-surface-input border border-border-input rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
              />
            </div>
            <p class="text-text-muted text-center text-sm">Game {i + 1}</p>
            <div>
              <label for="adminAwayScore-{i}" class="sr-only"
                >{getAwayName()} score, game {i + 1}</label
              >
              <input
                id="adminAwayScore-{i}"
                type="number"
                name="awayScore_{i}"
                min="0"
                bind:value={entry.away}
                placeholder="0"
                class="w-full px-3 py-2 bg-surface-input border border-border-input rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
              />
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if isDisputed}
      <label class="flex items-center gap-3 mb-4 cursor-pointer">
        <input
          type="checkbox"
          name="resolveDispute"
          value="true"
          bind:checked={adminResolveDispute}
          class="w-4 h-4 rounded border-border-input bg-surface-input text-primary-600 focus:ring-primary-500"
        />
        <span class="text-sm text-text-label">Resolve dispute and mark as Played</span>
      </label>
    {:else}
      <input type="hidden" name="resolveDispute" value="false" />
    {/if}

    <p class="text-xs text-text-muted mb-4">
      Leave all fields for a game blank to omit that game. At least one complete game score is
      required.
    </p>

    <div class="flex justify-end gap-3">
      <Button
        type="button"
        variant="secondary"
        onclick={() => (showAdminEditScores = false)}
        disabled={isEditingScores}
      >
        Cancel
      </Button>
      <Button type="submit" variant="primary" disabled={isEditingScores}>
        {isEditingScores ? 'Saving...' : 'Save Scores'}
      </Button>
    </div>
  </form>
</Dialog>

<!-- Demo Upload Modal -->
<Dialog open={showDemoUploadModal} title="Upload Demo" onClose={closeDemoUploadModal}>
  {#if isUploadingDemo}
    <!-- Upload Progress State -->
    <div class="py-8">
      <div class="flex flex-col items-center justify-center">
        <div class="relative w-16 h-16 mb-4">
          <div class="absolute inset-0 border-4 border-surface-hover rounded-full"></div>
          <div
            class="absolute inset-0 border-4 border-primary-500 rounded-full border-t-transparent animate-spin"
          ></div>
        </div>

        <p class="text-white font-medium mb-2">Uploading Demo...</p>
        <p class="text-text-body text-sm mb-4">{demoUploadProgress}</p>

        {#if selectedDemoFile}
          <div class="bg-surface-hover/50 rounded-lg px-4 py-2 text-sm">
            <span class="text-text-label">{selectedDemoFile.name}</span>
            <span class="text-text-muted ml-2">({formatFileSize(selectedDemoFile.size)})</span>
          </div>
        {/if}

        <p class="text-xs text-text-muted mt-4">Large files may take a few minutes</p>
      </div>
    </div>
  {:else}
    <!-- Upload Form -->
    <form
      method="POST"
      action="?/uploadDemo"
      enctype="multipart/form-data"
      use:enhance={() => {
        isUploadingDemo = true;
        demoUploadError = null;
        demoUploadProgress = 'Uploading file...';

        const progressMessages = [
          'Uploading file...',
          'Processing demo...',
          'Saving to storage...',
          'Almost done...',
        ];
        let msgIndex = 0;
        const progressInterval = setInterval(() => {
          msgIndex = Math.min(msgIndex + 1, progressMessages.length - 1);
          demoUploadProgress = progressMessages[msgIndex];
        }, 3000);

        return async ({ result, update }) => {
          clearInterval(progressInterval);
          isUploadingDemo = false;

          if (result.type === 'success') {
            closeDemoUploadModal();
          } else if (result.type === 'failure') {
            const errorData = result.data as { error?: string } | undefined;
            demoUploadError = errorData?.error || 'Upload failed. Please try again.';
          } else if (result.type === 'error') {
            demoUploadError = 'Network error. Please check your connection and try again.';
          }

          await update();
        };
      }}
    >
      <FormSelect
        label="Player"
        name="playerSteamId"
        required
        options={data.allRoster.map((p) => ({ value: p.steamId, label: p.username }))}
        placeholder="Select a player..."
      />

      <div class="mb-6">
        <label for="demoFile" class="block text-sm font-medium text-text-label mb-2">
          Demo File (.dem) <span class="text-danger-500">*</span>
        </label>
        <input
          type="file"
          id="demoFile"
          name="file"
          accept=".dem"
          required
          onchange={handleDemoFileSelect}
          class="w-full text-sm text-white
					   file:mr-4 file:py-2 file:px-4
					   file:rounded file:border-0
					   file:text-sm file:font-semibold
					   file:bg-surface-hover file:text-white
					   hover:file:bg-surface-input
					   cursor-pointer"
        />

        {#if selectedDemoFile}
          <div class="mt-2 p-2 bg-surface-hover/50 rounded flex items-center gap-2">
            <svg
              class="w-5 h-5 text-success-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span class="text-white text-sm">{selectedDemoFile.name}</span>
            <span class="text-text-muted text-xs">({formatFileSize(selectedDemoFile.size)})</span>
          </div>
        {:else}
          <p class="text-xs text-text-muted mt-1">Maximum file size: 200MB</p>
        {/if}
      </div>

      <div class="mb-6">
        <label for="demoDescription" class="block text-sm font-medium text-text-label mb-2"
          >Description (Optional)</label
        >
        <textarea
          id="demoDescription"
          name="description"
          rows="3"
          class="w-full px-4 py-3 bg-surface-input border border-border-input rounded-lg text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors resize-none"
          placeholder="Add any notes about this demo..."></textarea>
      </div>

      {#if demoUploadError}
        <div class="mb-4 p-4 bg-danger-500/10 border border-danger-500/30 rounded-lg">
          <div class="flex items-start gap-3">
            <svg
              class="w-5 h-5 text-danger-400 shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p class="text-danger-400 font-medium text-sm">Upload Failed</p>
              <p class="text-danger-400/80 text-sm mt-1">{demoUploadError}</p>
              <p class="text-danger-400/60 text-xs mt-2">
                If this persists, try a smaller file or contact support.
              </p>
            </div>
          </div>
        </div>
      {/if}

      <div class="flex justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          onclick={closeDemoUploadModal}
          disabled={isUploadingDemo}
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!selectedDemoFile || !!demoUploadError}>
          Upload Demo
        </Button>
      </div>
    </form>
  {/if}
</Dialog>

<!-- Demo Report Modal -->
{#if selectedDemoForReport}
  <Dialog open={showDemoReportModal} title="Report Demo" onClose={closeDemoReportModal}>
    <FormError error={form?.error} success={form?.success ? form.message : null} />

    <div class="mb-4">
      <p class="text-text-label mb-2">
        Reporting demo for:
        <span class="font-bold text-white">
          {selectedDemoForReport.player?.steamUsername || 'Unknown Player'}
        </span>
      </p>
      <p class="text-sm text-text-body">
        Please describe why you believe this demo should be reviewed for suspicious activity.
      </p>
    </div>

    <form
      method="POST"
      action="?/reportDemo"
      use:enhance={() => {
        isReportingDemo = true;
        return async ({ result, update }) => {
          isReportingDemo = false;
          if (result.type === 'success') {
            closeDemoReportModal();
          }
          await update();
        };
      }}
    >
      <input type="hidden" name="demoId" value={selectedDemoForReport.id} />

      <div class="mb-6">
        <label for="reportDescription" class="block text-sm font-medium text-text-label mb-2">
          Description <span class="text-danger-500">*</span>
        </label>
        <textarea
          id="reportDescription"
          name="description"
          rows="4"
          required
          maxlength="1000"
          class="w-full px-4 py-3 bg-surface-input border border-border-input rounded-lg text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors resize-none"
          placeholder="Describe the suspicious behavior (max 1000 characters)..."></textarea>
      </div>

      <div class="flex justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          onclick={closeDemoReportModal}
          disabled={isReportingDemo}
        >
          Cancel
        </Button>
        <Button type="submit" variant="danger" disabled={isReportingDemo}>
          {isReportingDemo ? 'Submitting...' : 'Submit Report'}
        </Button>
      </div>
    </form>
  </Dialog>
{/if}
