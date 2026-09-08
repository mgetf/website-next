<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import FormError from '$lib/components/ui/form/FormError.svelte';
  import { toast } from '$lib/state/toast.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  type DiscordRuleDraft = {
    permissionLevel: string;
    formatId: string;
    regionId: string;
    discordRoleId: string;
  };

  type ServerMapDraft = {
    regionId: string;
    sourcebansServerId: string;
  };

  let moderatorServerGroupId = $state('');
  let moderatorWebGroupId = $state('');
  let moderatorImmunity = $state('0');
  let moderatorDiscordRoleIds = $state<string[]>([]);
  let adminServerGroupId = $state('');
  let adminWebGroupId = $state('');
  let adminImmunity = $state('0');
  let adminDiscordRoleIds = $state<string[]>([]);
  let discordRules = $state<DiscordRuleDraft[]>([]);
  let sourcebansServers = $state<ServerMapDraft[]>([]);
  let newRulePermission = $state('');
  let newRuleFormat = $state('');
  let newRuleRegion = $state('');
  let newRuleRole = $state('');
  let newServerRegion = $state('');
  let newServerId = $state('');
  let isSubmitting = $state(false);
  let lastFormResult: ActionData = null;

  $effect(() => {
    const moderator = data.mappings.roleMappings.find((row) => row.permissionLevel === 'MODERATOR');
    const admin = data.mappings.roleMappings.find((row) => row.permissionLevel === 'ADMIN');
    moderatorServerGroupId = moderator?.sourcebansServerGroupId
      ? String(moderator.sourcebansServerGroupId)
      : '';
    moderatorWebGroupId = moderator?.sourcebansWebGroupId
      ? String(moderator.sourcebansWebGroupId)
      : '';
    moderatorImmunity = String(moderator?.sourcebansImmunity ?? 0);
    moderatorDiscordRoleIds = [...(moderator?.discordRoleIds ?? [])];
    adminServerGroupId = admin?.sourcebansServerGroupId
      ? String(admin.sourcebansServerGroupId)
      : '';
    adminWebGroupId = admin?.sourcebansWebGroupId ? String(admin.sourcebansWebGroupId) : '';
    adminImmunity = String(admin?.sourcebansImmunity ?? 0);
    adminDiscordRoleIds = [...(admin?.discordRoleIds ?? [])];
    discordRules = data.mappings.discordRules.map((rule) => ({
      permissionLevel: rule.permissionLevel ?? '',
      formatId: rule.formatId ? String(rule.formatId) : '',
      regionId: rule.regionId ? String(rule.regionId) : '',
      discordRoleId: rule.discordRoleId,
    }));
    sourcebansServers = data.mappings.sourcebansServers.map((row) => ({
      regionId: String(row.regionId),
      sourcebansServerId: String(row.sourcebansServerId),
    }));
  });

  $effect(() => {
    if (form && form !== lastFormResult) {
      lastFormResult = form;
      if (form.success && form.message) toast.success(form.message);
      else if (form.error) toast.error(form.error);
    }
  });

  const serverGroupOptions = $derived(
    data.sourcebansGroups.server.map((group) => ({
      value: String(group.id),
      label: `${group.name} (${group.flags || 'no flags'})`,
    })),
  );
  const webGroupOptions = $derived(
    data.sourcebansGroups.web.map((group) => ({
      value: String(group.id),
      label: group.name,
    })),
  );
  const formatOptions = $derived(
    data.formats.map((format) => ({ value: String(format.id), label: format.name })),
  );
  const regionOptions = $derived(
    data.regions.map((region) => ({ value: String(region.id), label: region.name })),
  );
  const discordRoleOptions = $derived(
    data.discordRoles.map((role) => ({ value: role.id, label: role.name })),
  );
  const sourcebansServerOptions = $derived(
    data.sourcebansServers.map((server) => ({ value: String(server.id), label: server.label })),
  );

  function roleName(id: string) {
    return data.discordRoles.find((role) => role.id === id)?.name ?? id;
  }

  function formatName(id: string) {
    if (!id) return 'Any format';
    return data.formats.find((format) => String(format.id) === id)?.name ?? id;
  }

  function regionName(id: string) {
    if (!id) return 'Any region';
    return data.regions.find((region) => String(region.id) === id)?.name ?? id;
  }

  function permissionLabel(value: string) {
    if (value === 'ADMIN') return 'Admin';
    if (value === 'MODERATOR') return 'Moderator';
    return 'Any role';
  }

  function toggleRole(list: string[], roleId: string, checked: boolean) {
    if (checked) return list.includes(roleId) ? list : [...list, roleId];
    return list.filter((id) => id !== roleId);
  }

  function addDiscordRule() {
    if (!newRuleRole) return;
    discordRules = [
      ...discordRules,
      {
        permissionLevel: newRulePermission,
        formatId: newRuleFormat,
        regionId: newRuleRegion,
        discordRoleId: newRuleRole,
      },
    ];
    newRuleRole = '';
  }

  function addServerMap() {
    if (!newServerRegion || !newServerId) return;
    if (
      sourcebansServers.some(
        (row) => row.regionId === newServerRegion && row.sourcebansServerId === newServerId,
      )
    ) {
      return;
    }
    sourcebansServers = [
      ...sourcebansServers,
      { regionId: newServerRegion, sourcebansServerId: newServerId },
    ];
    newServerId = '';
  }
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <div class="flex items-end justify-between gap-3">
    <div>
      <h2 class="text-3xl font-bold text-white mb-2">Staff mappings</h2>
      <p class="text-text-body">
        Map Moderator and Admin to SourceBans groups and Discord roles. Scoped rules add extra
        Discord roles from league assignments.
      </p>
    </div>
    <Button variant="secondary" href="/admin/staff">Back to staff</Button>
  </div>

  {#if !data.sourcebansConfigured}
    <p class="text-sm text-warning-400">
      SourceBans is not configured. Set SOURCEBANS_API_URL and SOURCEBANS_API_TOKEN to sync in-game
      admin.
    </p>
  {/if}
  {#if !data.discordConfigured}
    <p class="text-sm text-warning-400">
      Discord bot is not configured. Set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID to assign guild
      roles.
    </p>
  {/if}

  <FormError error={form?.error} />

  <form
    method="POST"
    action="?/save"
    class="space-y-6"
    use:enhance={() => {
      isSubmitting = true;
      return async ({ update }) => {
        await update();
        isSubmitting = false;
      };
    }}
  >
    {#each moderatorDiscordRoleIds as roleId (roleId)}
      <input type="hidden" name="moderatorDiscordRoleIds" value={roleId} />
    {/each}
    {#each adminDiscordRoleIds as roleId (roleId)}
      <input type="hidden" name="adminDiscordRoleIds" value={roleId} />
    {/each}
    {#each discordRules as rule, index (`${rule.discordRoleId}-${index}`)}
      <input
        type="hidden"
        name="discordRules"
        value="{rule.permissionLevel}|{rule.formatId}|{rule.regionId}|{rule.discordRoleId}"
      />
    {/each}
    {#each sourcebansServers as row, index (`${row.regionId}:${row.sourcebansServerId}-${index}`)}
      <input
        type="hidden"
        name="sourcebansServers"
        value="{row.regionId}:{row.sourcebansServerId}"
      />
    {/each}

    <Card>
      {#snippet header()}
        <h3 class="text-lg font-semibold text-white">Moderator</h3>
      {/snippet}
      <FormSelect
        label="SourceBans server group"
        name="moderatorServerGroupId"
        bind:value={moderatorServerGroupId}
        options={serverGroupOptions}
        placeholder="None"
        disabled={!data.sourcebansConfigured}
      />
      <FormSelect
        label="SourceBans web group"
        name="moderatorWebGroupId"
        bind:value={moderatorWebGroupId}
        options={webGroupOptions}
        placeholder="None"
        disabled={!data.sourcebansConfigured}
        hint="Optional panel access. Uses a noreply email on the SourceBans admin row."
      />
      <FormInput
        label="Immunity"
        name="moderatorImmunity"
        type="number"
        bind:value={moderatorImmunity}
      />
      <fieldset class="mb-2">
        <legend class="block text-sm font-medium text-text-label mb-2"
          >Always-on Discord roles</legend
        >
        {#if discordRoleOptions.length === 0}
          <p class="text-sm text-text-muted">No Discord roles loaded.</p>
        {:else}
          <div class="grid gap-2 sm:grid-cols-2">
            {#each discordRoleOptions as role (role.value)}
              <label class="flex items-center gap-2 text-sm text-text-label">
                <input
                  type="checkbox"
                  checked={moderatorDiscordRoleIds.includes(role.value)}
                  onchange={(event) => {
                    moderatorDiscordRoleIds = toggleRole(
                      moderatorDiscordRoleIds,
                      role.value,
                      event.currentTarget.checked,
                    );
                  }}
                />
                {role.label}
              </label>
            {/each}
          </div>
        {/if}
      </fieldset>
    </Card>

    <Card>
      {#snippet header()}
        <h3 class="text-lg font-semibold text-white">Admin</h3>
      {/snippet}
      <FormSelect
        label="SourceBans server group"
        name="adminServerGroupId"
        bind:value={adminServerGroupId}
        options={serverGroupOptions}
        placeholder="None"
        disabled={!data.sourcebansConfigured}
      />
      <FormSelect
        label="SourceBans web group"
        name="adminWebGroupId"
        bind:value={adminWebGroupId}
        options={webGroupOptions}
        placeholder="None"
        disabled={!data.sourcebansConfigured}
      />
      <FormInput label="Immunity" name="adminImmunity" type="number" bind:value={adminImmunity} />
      <fieldset class="mb-2">
        <legend class="block text-sm font-medium text-text-label mb-2"
          >Always-on Discord roles</legend
        >
        {#if discordRoleOptions.length === 0}
          <p class="text-sm text-text-muted">No Discord roles loaded.</p>
        {:else}
          <div class="grid gap-2 sm:grid-cols-2">
            {#each discordRoleOptions as role (role.value)}
              <label class="flex items-center gap-2 text-sm text-text-label">
                <input
                  type="checkbox"
                  checked={adminDiscordRoleIds.includes(role.value)}
                  onchange={(event) => {
                    adminDiscordRoleIds = toggleRole(
                      adminDiscordRoleIds,
                      role.value,
                      event.currentTarget.checked,
                    );
                  }}
                />
                {role.label}
              </label>
            {/each}
          </div>
        {/if}
      </fieldset>
    </Card>

    <Card>
      {#snippet header()}
        <h3 class="text-lg font-semibold text-white">Discord rules</h3>
      {/snippet}
      <p class="text-sm text-text-muted mb-4">
        Extra roles granted when a staff member’s league assignments match. Empty filters mean
        “any”.
      </p>
      {#if discordRules.length === 0}
        <p class="text-sm text-text-muted mb-4">No scoped rules yet.</p>
      {:else}
        <ul class="mb-4 divide-y divide-border-default">
          {#each discordRules as rule, index (`${rule.discordRoleId}-${index}`)}
            <li class="flex items-center justify-between gap-3 py-2">
              <p class="text-sm text-text-label">
                {permissionLabel(rule.permissionLevel)} · {formatName(rule.formatId)} ·
                {regionName(rule.regionId)} → {roleName(rule.discordRoleId)}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onclick={() => {
                  discordRules = discordRules.filter((_, i) => i !== index);
                }}
              >
                Remove
              </Button>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 [&>div]:mb-0">
        <FormSelect
          label="Role filter"
          name="newRulePermission"
          bind:value={newRulePermission}
          options={[
            { value: 'MODERATOR', label: 'Moderator' },
            { value: 'ADMIN', label: 'Admin' },
          ]}
          placeholder="Any role"
        />
        <FormSelect
          label="Format filter"
          name="newRuleFormat"
          bind:value={newRuleFormat}
          options={formatOptions}
          placeholder="Any format"
        />
        <FormSelect
          label="Region filter"
          name="newRuleRegion"
          bind:value={newRuleRegion}
          options={regionOptions}
          placeholder="Any region"
        />
        <FormSelect
          label="Discord role"
          name="newRuleRole"
          bind:value={newRuleRole}
          options={discordRoleOptions}
          placeholder="Select role..."
        />
      </div>
      <div class="mt-4">
        <Button type="button" variant="secondary" onclick={addDiscordRule} disabled={!newRuleRole}>
          Add rule
        </Button>
      </div>
    </Card>

    <Card>
      {#snippet header()}
        <h3 class="text-lg font-semibold text-white">SourceBans servers by region</h3>
      {/snippet}
      <p class="text-sm text-text-muted mb-4">
        If this list is empty, staff keep default SourceBans server access. Otherwise only servers
        for their assigned regions are sent.
      </p>
      {#if sourcebansServers.length === 0}
        <p class="text-sm text-text-muted mb-4">No region → server rows.</p>
      {:else}
        <ul class="mb-4 divide-y divide-border-default">
          {#each sourcebansServers as row, index (`${row.regionId}:${row.sourcebansServerId}-${index}`)}
            <li class="flex items-center justify-between gap-3 py-2">
              <p class="text-sm text-text-label">
                {regionName(row.regionId)} →
                {data.sourcebansServers.find(
                  (server) => String(server.id) === row.sourcebansServerId,
                )?.label ?? row.sourcebansServerId}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onclick={() => {
                  sourcebansServers = sourcebansServers.filter((_, i) => i !== index);
                }}
              >
                Remove
              </Button>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 [&>div]:mb-0">
        <FormSelect
          label="Region"
          name="newServerRegion"
          bind:value={newServerRegion}
          options={regionOptions}
          placeholder="Select region..."
        />
        <FormSelect
          label="SourceBans server"
          name="newServerId"
          bind:value={newServerId}
          options={sourcebansServerOptions}
          placeholder="Select server..."
          disabled={!data.sourcebansConfigured}
        />
      </div>
      <div class="mt-4">
        <Button
          type="button"
          variant="secondary"
          onclick={addServerMap}
          disabled={!newServerRegion || !newServerId}
        >
          Add server
        </Button>
      </div>
    </Card>

    <div class="flex justify-end">
      <Button type="submit" variant="primary" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save mappings'}
      </Button>
    </div>
  </form>
</div>
