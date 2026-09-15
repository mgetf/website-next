<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import StaffRoleBadge from '$lib/components/ui/StaffRoleBadge.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import Tooltip from '$lib/components/ui/Tooltip.svelte';
  import DiscordIcon from '$lib/components/icons/DiscordIcon.svelte';
  import { toast } from '$lib/state/toast.svelte';
  import Settings from '~icons/lucide/settings';
  import X from '~icons/lucide/x';
  import {
    EXTERNAL_LINKS,
    MOCK_ACHIEVEMENTS,
    MOCK_DIVISIONS_1V1,
    MOCK_FIGHT_NIGHTS,
    MOCK_PLAYER,
    MOCK_RATING_SERIES,
    MOCK_TOURNAMENTS,
    PLATFORM_REGIONS,
    getActive1v1,
    getEntries1v1,
    getLeagueHub,
    getMockServerStats,
    getRatings,
    getTeams,
    type EntryScenario,
    type ProfileTab,
    type RatingCount,
    type TeamCount,
    type ViewerRole,
  } from './mock-data';
  import ChatHistoryPanel from './ChatHistoryPanel.svelte';
  import MyLeaguePanel from './MyLeaguePanel.svelte';
  import InsightsPanel from '$lib/components/profile/InsightsPanel.svelte';
  import LeaguePanel from '$lib/components/profile/LeaguePanel.svelte';
  import OverviewPanel from '$lib/components/profile/OverviewPanel.svelte';
  import type { Profile1v1Entry, ProfileTeam } from '$lib/types/profile';

  let viewer = $state<ViewerRole>('staff');
  let profileRole = $state<'ADMIN' | 'MODERATOR'>('MODERATOR');
  let scenario = $state<EntryScenario>('pending');
  let ratingCount = $state<RatingCount>(1);
  let teamCount = $state<TeamCount>(1);
  let staffOpen = $state(false);
  let confirmReady = $state(false);
  let confirmWithdraw = $state(false);
  let confirmPaid = $state(false);

  let mockName = $state(MOCK_PLAYER.name);
  let mockBan = $state('NONE');

  const isOwn = $derived(viewer === 'owner');
  const isStaff = $derived(viewer === 'staff');
  const entries1v1 = $derived(getEntries1v1(scenario) as unknown as Profile1v1Entry[]);
  const active1v1 = $derived(getActive1v1(scenario) as unknown as Profile1v1Entry | null);
  const ratings = $derived(getRatings(ratingCount));
  const teams = $derived(getTeams(teamCount) as unknown as ProfileTeam[]);
  const leagueHub = $derived(getLeagueHub(scenario, teamCount));
  const compactPreview = $derived(
    ratings.length === 1 && ratings[0] ? (MOCK_RATING_SERIES[ratings[0].region] ?? []) : undefined,
  );
  const requestedTab = $derived(parseProfileTab(page.url.searchParams.get('tab')));
  const tab = $derived(
    !isStaff && (requestedTab === 'league' || requestedTab === 'chat') ? 'overview' : requestedTab,
  );

  const publicTabs: { id: ProfileTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: '1v1', label: '1v1' },
    { id: 'stats', label: 'Stats' },
  ];
  const staffTabs: { id: ProfileTab; label: string }[] = [
    { id: 'league', label: 'My league' },
    { id: 'chat', label: 'Chat' },
  ];
  const tabs = $derived(isStaff ? [...publicTabs, ...staffTabs] : publicTabs);

  const viewers: { id: ViewerRole; label: string }[] = [
    { id: 'visitor', label: 'Visitor' },
    { id: 'owner', label: 'Own profile' },
    { id: 'staff', label: 'Staff' },
  ];

  const profileRoles: { id: 'ADMIN' | 'MODERATOR'; label: string }[] = [
    { id: 'MODERATOR', label: 'Moderator' },
    { id: 'ADMIN', label: 'Admin' },
  ];

  const scenarios: { id: EntryScenario; label: string }[] = [
    { id: 'none', label: 'No entry' },
    { id: 'unready_unpaid', label: 'Unready, unpaid' },
    { id: 'pending', label: 'Pending' },
    { id: 'active', label: 'Active' },
  ];

  const ratingCounts: RatingCount[] = [0, 1, 2, 3, 4, 5, 6, 7];
  const teamCounts: TeamCount[] = [0, 1, 2, 3];

  const mockPath = resolve('/dev/profile-mock');

  function parseProfileTab(raw: string | null): ProfileTab {
    if (raw === '1v1' || raw === 'stats' || raw === 'league' || raw === 'chat') return raw;
    return 'overview';
  }

  function tabHref(next: ProfileTab): string {
    const params = new URLSearchParams(page.url.searchParams);
    if (next === 'overview') params.delete('tab');
    else params.set('tab', next);
    const search = params.toString();
    return search ? `${mockPath}?${search}` : mockPath;
  }

  function setTab(next: ProfileTab) {
    void goto(tabHref(next), { keepFocus: true, noScroll: true });
  }

  function mockOnly(message: string) {
    toast.info(message);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') staffOpen = false;
  }
</script>

<svelte:window onkeydown={onKeydown} />

<svelte:head>
  <title>Profile mock — {MOCK_PLAYER.name} | MGE.tf</title>
</svelte:head>

<div class="border-b border-warning-500/30 bg-warning-500/5">
  <div class="mx-auto flex max-w-6xl flex-wrap items-end gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
    <Badge color="yellow">Mock</Badge>
    <div class="flex flex-wrap items-end gap-x-4 gap-y-2">
      <div>
        <p class="mb-1 text-xs text-text-muted">Viewer</p>
        <div class="flex overflow-hidden rounded-lg border border-border-input">
          {#each viewers as option (option.id)}
            <button
              type="button"
              class="px-3 py-1.5 text-xs font-medium transition-colors {viewer === option.id
                ? 'bg-primary-700 text-white'
                : 'bg-surface-input text-text-body hover:bg-surface-hover'}"
              aria-pressed={viewer === option.id}
              onclick={() => {
                const leavingStaff = option.id !== 'staff';
                const onStaffTab = requestedTab === 'league' || requestedTab === 'chat';
                viewer = option.id;
                if (leavingStaff && onStaffTab) {
                  void goto(tabHref('overview'), {
                    keepFocus: true,
                    noScroll: true,
                    replaceState: true,
                  });
                }
              }}
            >
              {option.label}
            </button>
          {/each}
        </div>
      </div>
      <div>
        <p class="mb-1 text-xs text-text-muted">Medal</p>
        <div class="flex overflow-hidden rounded-lg border border-border-input">
          {#each profileRoles as option (option.id)}
            <button
              type="button"
              class="px-3 py-1.5 text-xs font-medium transition-colors {profileRole === option.id
                ? 'bg-primary-700 text-white'
                : 'bg-surface-input text-text-body hover:bg-surface-hover'}"
              aria-pressed={profileRole === option.id}
              onclick={() => (profileRole = option.id)}
            >
              {option.label}
            </button>
          {/each}
        </div>
      </div>
      <div>
        <p class="mb-1 text-xs text-text-muted">1v1 entry</p>
        <div class="flex overflow-hidden rounded-lg border border-border-input">
          {#each scenarios as option (option.id)}
            <button
              type="button"
              class="px-3 py-1.5 text-xs font-medium transition-colors {scenario === option.id
                ? 'bg-primary-700 text-white'
                : 'bg-surface-input text-text-body hover:bg-surface-hover'}"
              aria-pressed={scenario === option.id}
              onclick={() => (scenario = option.id)}
            >
              {option.label}
            </button>
          {/each}
        </div>
      </div>
      <div>
        <p class="mb-1 text-xs text-text-muted">Ratings</p>
        <div class="flex overflow-hidden rounded-lg border border-border-input">
          {#each ratingCounts as count (count)}
            <button
              type="button"
              class="min-w-8 px-2.5 py-1.5 text-xs font-medium transition-colors {ratingCount ===
              count
                ? 'bg-primary-700 text-white'
                : 'bg-surface-input text-text-body hover:bg-surface-hover'}"
              aria-pressed={ratingCount === count}
              onclick={() => (ratingCount = count)}
            >
              {count}
            </button>
          {/each}
        </div>
      </div>
      <div>
        <p class="mb-1 text-xs text-text-muted">Teams</p>
        <div class="flex overflow-hidden rounded-lg border border-border-input">
          {#each teamCounts as count (count)}
            <button
              type="button"
              class="min-w-8 px-2.5 py-1.5 text-xs font-medium transition-colors {teamCount ===
              count
                ? 'bg-primary-700 text-white'
                : 'bg-surface-input text-text-body hover:bg-surface-hover'}"
              aria-pressed={teamCount === count}
              onclick={() => (teamCount = count)}
            >
              {count}
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<header class="border-b border-border-default bg-surface-page/80">
  <div class="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center">
    <img
      src={MOCK_PLAYER.avatar}
      alt=""
      class="size-24 shrink-0 rounded-xl border-2 border-border-input object-cover shadow-lg"
    />

    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 class="text-3xl font-black tracking-tight text-white sm:text-4xl">
          {MOCK_PLAYER.name}
        </h1>
        <StaffRoleBadge role={profileRole} assignments={MOCK_PLAYER.staffAssignments} />
      </div>
      {#if isStaff}
        <p class="mt-1.5 font-mono text-xs text-text-muted">{MOCK_PLAYER.steamId}</p>
      {/if}

      <div class="mt-3 flex flex-wrap items-center gap-1.5">
        {#each EXTERNAL_LINKS as link (link.name)}
          <Tooltip text={link.name}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              class="flex size-8 items-center justify-center rounded-lg bg-surface-input transition-colors hover:bg-surface-hover"
            >
              <img src={link.logo} alt="" class="size-4 {link.rounded ? 'rounded' : ''}" />
              <span class="sr-only">{link.name}</span>
            </a>
          </Tooltip>
        {/each}

        {#if MOCK_PLAYER.discordLinked}
          <span
            class="inline-flex items-center gap-1.5 rounded-lg bg-info-500/20 px-2.5 py-1.5 text-xs text-info-400"
          >
            <DiscordIcon size={14} />
            {MOCK_PLAYER.discordUsername}
          </span>
        {:else if isOwn}
          <Button href="/auth/discord/login" size="sm" class="inline-flex items-center gap-1.5">
            <DiscordIcon size={14} />
            Link Discord
          </Button>
        {:else}
          <span
            class="inline-flex items-center gap-1.5 rounded-lg bg-surface-input px-2.5 py-1.5 text-xs text-text-body"
          >
            <DiscordIcon size={14} />
            Discord not linked
          </span>
        {/if}
      </div>
    </div>

    {#if isStaff}
      <div class="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
        <div class="flex flex-wrap gap-1.5 lg:justify-end">
          <button
            type="button"
            class="rounded bg-surface-input/60 px-2.5 py-1 text-[11px] transition-colors hover:bg-surface-hover/60"
            onclick={() => (staffOpen = true)}
          >
            <span class="text-text-muted">Name:</span>
            <span class="text-text-body"> Auto</span>
          </button>
          <button
            type="button"
            class="rounded bg-surface-input/60 px-2.5 py-1 text-[11px] transition-colors hover:bg-surface-hover/60"
            onclick={() => (staffOpen = true)}
          >
            <span class="text-text-muted">Avatar:</span>
            <span class="text-text-body"> Auto</span>
          </button>
          <button
            type="button"
            class="rounded bg-surface-input/60 px-2.5 py-1 text-[11px] transition-colors hover:bg-surface-hover/60"
            onclick={() => (staffOpen = true)}
          >
            <span class="text-text-muted">Status:</span>
            <span class="text-success-400"> Clean</span>
          </button>
        </div>
        <Button
          variant="secondary"
          size="sm"
          class="inline-flex items-center gap-1.5"
          onclick={() => (staffOpen = true)}
        >
          <Settings class="size-3.5" />
          Staff tools
        </Button>
      </div>
    {/if}
  </div>
</header>

<div class="border-b border-border-default bg-surface-page">
  <div class="mx-auto max-w-6xl px-4 sm:px-6">
    <div class="flex gap-1" role="tablist" aria-label="Profile sections">
      {#each tabs as item (item.id)}
        <a
          href={tabHref(item.id)}
          role="tab"
          id="tab-{item.id}"
          aria-selected={tab === item.id}
          aria-controls="panel-{item.id}"
          data-sveltekit-noscroll
          class="inline-flex items-center border-b-2 px-4 py-3 text-sm font-medium transition-colors {tab ===
          item.id
            ? 'border-primary-500 text-white'
            : 'border-transparent text-text-muted hover:text-text-label'}"
        >
          {item.label}
          {#if item.id === 'league' || item.id === 'chat'}
            <span class="ml-1.5 text-[10px] font-medium text-warning-400">Staff</span>
          {/if}
        </a>
      {/each}
    </div>
  </div>
</div>

<div class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
  {#if tab === 'overview'}
    <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview">
      <OverviewPanel
        {ratings}
        regions={PLATFORM_REGIONS}
        steamId={MOCK_PLAYER.steamId}
        {isOwn}
        {entries1v1}
        {teams}
        achievements={MOCK_ACHIEVEMENTS}
        tournaments={MOCK_TOURNAMENTS}
        fightNights={MOCK_FIGHT_NIGHTS}
        onOpen1v1={() => setTab('1v1')}
        previewCompactSeries={compactPreview}
      />
    </div>
  {:else if tab === '1v1'}
    <div id="panel-1v1" role="tabpanel" aria-labelledby="tab-1v1">
      {#key scenario}
        <LeaguePanel
          steamId={MOCK_PLAYER.steamId}
          {isOwn}
          {isStaff}
          entry={active1v1}
          divisions={MOCK_DIVISIONS_1V1}
          onReady={() => (confirmReady = true)}
          onWithdraw={() => (confirmWithdraw = true)}
          onUpdateStatus={(status) => mockOnly(`Mock: status → ${status}`)}
          onUpdateDivision={(divisionId) => mockOnly(`Mock: division → ${divisionId}`)}
          onMarkPaid={() => (confirmPaid = true)}
        />
      {/key}
    </div>
  {:else if tab === 'stats'}
    <div id="panel-stats" role="tabpanel" aria-labelledby="tab-stats">
      <InsightsPanel
        steamId={MOCK_PLAYER.steamId}
        {ratings}
        regions={PLATFORM_REGIONS}
        preview={getMockServerStats}
      />
    </div>
  {:else if tab === 'league'}
    <div id="panel-league" role="tabpanel" aria-labelledby="tab-league">
      <MyLeaguePanel rows={leagueHub} />
    </div>
  {:else if tab === 'chat'}
    <div id="panel-chat" role="tabpanel" aria-labelledby="tab-chat">
      <ChatHistoryPanel />
    </div>
  {/if}
</div>

{#if staffOpen}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-black/50"
    aria-label="Close staff tools"
    onclick={() => (staffOpen = false)}
  ></button>
  <aside
    class="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border-default bg-surface-card shadow-2xl"
  >
    <div class="flex items-center justify-between border-b border-border-default px-5 py-4">
      <div>
        <h2 class="text-lg font-bold text-white">Staff tools</h2>
        <p class="text-xs text-text-muted">
          Identity and moderation. 1v1 league controls stay on the 1v1 tab.
        </p>
      </div>
      <button
        type="button"
        class="rounded-lg p-1.5 text-text-body transition-colors hover:bg-surface-hover hover:text-white"
        aria-label="Close"
        onclick={() => (staffOpen = false)}
      >
        <X class="size-5" />
      </button>
    </div>
    <div class="flex-1 space-y-6 overflow-y-auto px-5 py-5">
      <div class="flex items-center gap-3 rounded-lg bg-surface-input p-3">
        <img src={MOCK_PLAYER.avatar} alt="" class="size-10 rounded-lg object-cover" />
        <div class="min-w-0">
          <p class="font-medium text-white">{MOCK_PLAYER.name}</p>
          <p class="font-mono text-xs text-text-muted">{MOCK_PLAYER.steamId}</p>
        </div>
      </div>
      <FormInput label="Display name" name="mockName" bind:value={mockName} />
      <div class="flex gap-2">
        <Button variant="primary" size="sm" onclick={() => mockOnly('Mock: name locked')}>
          Set and lock
        </Button>
        <Button variant="secondary" size="sm" onclick={() => mockOnly('Mock: name unlocked')}>
          Unlock
        </Button>
      </div>

      <FormInput
        label="Avatar URL"
        name="mockAvatar"
        placeholder="https://…"
        hint="Locking stops Steam from overwriting it on login."
      />
      <div class="flex gap-2">
        <Button variant="primary" size="sm" onclick={() => mockOnly('Mock: avatar locked')}>
          Set and lock
        </Button>
        <Button variant="secondary" size="sm" onclick={() => mockOnly('Mock: avatar unlocked')}>
          Unlock
        </Button>
      </div>

      <FormSelect
        label="Punishment"
        name="mockBan"
        id="mock-ban"
        bind:value={mockBan}
        options={[
          { value: 'NONE', label: 'None (clear)' },
          { value: 'WARNING', label: 'Warning' },
          { value: 'SUSPENDED', label: 'Suspended' },
          { value: 'BANNED', label: 'Banned' },
        ]}
      />
      <Button variant="danger" size="sm" onclick={() => mockOnly(`Mock: punishment → ${mockBan}`)}>
        Apply
      </Button>

      <div class="border-t border-border-default pt-4">
        <p class="mb-2 text-sm font-medium text-text-label">Discord</p>
        {#if MOCK_PLAYER.discordLinked}
          <p class="mb-3 inline-flex items-center gap-1.5 text-sm text-info-400">
            <DiscordIcon size={14} />
            {MOCK_PLAYER.discordUsername}
          </p>
          <div class="mb-4">
            <Button variant="danger" size="sm" onclick={() => mockOnly('Mock: Discord unlinked')}>
              Unlink Discord
            </Button>
          </div>
        {:else}
          <p class="mb-3 inline-flex items-center gap-1.5 text-sm text-text-body">
            <DiscordIcon size={14} />
            Discord not linked
          </p>
        {/if}
        <FormInput
          label={MOCK_PLAYER.discordLinked ? 'Replace Discord ID' : 'Link by Discord ID'}
          name="mockDiscordId"
          placeholder="123456789012345678"
          hint="Developer Mode → right-click the user → Copy User ID."
        />
        <div class="-mt-2">
          <Button
            variant="primary"
            size="sm"
            onclick={() => mockOnly('Mock: Discord linked by ID')}
          >
            {MOCK_PLAYER.discordLinked ? 'Replace' : 'Link Discord'}
          </Button>
        </div>
      </div>
    </div>
  </aside>
{/if}

<ConfirmDialog
  open={confirmReady}
  title="Ready up"
  description="Mark this 1v1 entry as ready? Staff will review it. (Mock — nothing is saved.)"
  confirmLabel="Ready up"
  variant="success"
  onConfirm={() => {
    confirmReady = false;
    mockOnly('Mock: ready-up submitted');
  }}
  onCancel={() => (confirmReady = false)}
/>

<ConfirmDialog
  open={confirmWithdraw}
  title="Withdraw from 1v1 league"
  description="Withdraw {MOCK_PLAYER.name} from the current 1v1 season? (Mock — nothing is saved.)"
  confirmLabel="Withdraw"
  variant="danger"
  onConfirm={() => {
    confirmWithdraw = false;
    mockOnly('Mock: withdrawn');
  }}
  onCancel={() => (confirmWithdraw = false)}
/>

<ConfirmDialog
  open={confirmPaid}
  title="Mark as paid"
  description="Record a manual payment for {MOCK_PLAYER.name}? (Mock — nothing is saved.)"
  confirmLabel="Mark as paid"
  variant="success"
  onConfirm={() => {
    confirmPaid = false;
    mockOnly('Mock: marked paid');
  }}
  onCancel={() => (confirmPaid = false)}
/>
