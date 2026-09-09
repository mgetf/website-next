<script lang="ts">
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import SelectFilter from '$lib/components/ui/SelectFilter.svelte';
  import BitsCheckbox from './BitsCheckbox.svelte';
  import BitsDropdownMenu from './BitsDropdownMenu.svelte';
  import BitsSwitch from './BitsSwitch.svelte';
  import HandmadeDropdown from './HandmadeDropdown.svelte';

  const divisions = [
    { value: 'premier', label: 'Premier' },
    { value: 'div1', label: 'Division 1' },
    { value: 'div2', label: 'Division 2' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'main', label: 'Main' },
    { value: 'open', label: 'Open' },
    { value: 'amateur', label: 'Amateur' },
    { value: 'newbie', label: 'Newbie' },
    { value: 'invite', label: 'Invite-only', disabled: true },
  ];

  let division = $state('');
  let filterDivision = $state('');

  let nativeChecked = $state(false);
  let bitsChecked = $state(false);
  let bitsMixedChecked = $state(false);
  let bitsIndeterminate = $state(true);

  let nativeToggle = $state(false);
  let bitsSwitch = $state(false);

  let dialogOpen = $state(false);
  let confirmOpen = $state(false);
  let confirmResult = $state('');

  let handmadeMenuAction = $state('');
  let bitsMenuAction = $state('');
</script>

<svelte:head>
  <title>UI playground — Bits UI primitives</title>
</svelte:head>

<div class="mx-auto max-w-6xl space-y-10 px-4 py-8">
  <div>
    <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
      /dev · admin only
    </p>
    <h1 class="text-2xl font-bold text-text-heading">UI playground</h1>
    <p class="mt-2 max-w-3xl text-sm text-text-body">
      Select, Dialog, and Tooltip now use Bits UI behind the shared components. Checkbox, switch,
      and nav-style menus are still the “not yet” column.
    </p>
  </div>

  <Card>
    {#snippet header()}
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-lg font-semibold text-white">These stay ours</h2>
        <Badge color="zinc">no library needed</Badge>
      </div>
    {/snippet}
    <p class="mb-4 text-sm text-text-body">
      Button, Card, and Badge are look, not behavior. A headless library does not replace them.
    </p>
    <div class="flex flex-wrap items-center gap-3">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="danger">Danger</Button>
      <Badge color="orange">Brand</Badge>
      <Badge color="blue">2v2</Badge>
      <Badge color="purple">1v1</Badge>
    </div>
  </Card>

  <section class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold text-white">Select — shipping</h2>
      <p class="text-sm text-text-body">
        <code class="text-text-label">FormSelect</code> and
        <code class="text-text-label">SelectFilter</code> share
        <code class="text-text-label">SelectMenu</code>. Open the list: same dark card as the old
        playground Bits column (arrows, typeahead, checkmark).
      </p>
    </div>
    <div class="grid gap-6 lg:grid-cols-2">
      <Card>
        {#snippet header()}
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-white">FormSelect</h3>
            <Badge color="orange">bits behind</Badge>
          </div>
        {/snippet}
        <FormSelect
          label="Division"
          name="playgroundDivision"
          bind:value={division}
          options={divisions}
          placeholder="Pick a division"
        />
        <p class="text-xs text-text-muted">Value: {division || '(empty)'} · type “p” for Premier</p>
      </Card>
      <Card>
        {#snippet header()}
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-white">SelectFilter</h3>
            <Badge color="orange">bits behind</Badge>
          </div>
        {/snippet}
        <SelectFilter bind:value={filterDivision} options={divisions} allLabel="All divisions" />
        <p class="mt-3 text-xs text-text-muted">Value: {filterDivision || '(all)'}</p>
      </Card>
    </div>
  </section>

  <section class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold text-white">Dialog — shipping</h2>
      <p class="text-sm text-text-body">
        Same
        <code class="text-text-label">Dialog</code> /
        <code class="text-text-label">ConfirmDialog</code> API. Bits traps focus and portals out of overflow.
        Tab around while one is open.
      </p>
    </div>
    <div class="grid gap-6 lg:grid-cols-2">
      <Card>
        {#snippet header()}
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-white">Dialog</h3>
            <Badge color="orange">bits behind</Badge>
          </div>
        {/snippet}
        <Button variant="secondary" type="button" onclick={() => (dialogOpen = true)}>
          Open dialog
        </Button>
        <Dialog open={dialogOpen} title="Shared dialog" onClose={() => (dialogOpen = false)}>
          <p class="text-text-body">Try Tab: focus stays inside until you close it.</p>
          {#snippet footer()}
            <Button variant="secondary" type="button" onclick={() => (dialogOpen = false)}>
              Close
            </Button>
          {/snippet}
        </Dialog>
      </Card>
      <Card>
        {#snippet header()}
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-white">ConfirmDialog</h3>
            <Badge color="orange">uses Dialog</Badge>
          </div>
        {/snippet}
        <Button variant="danger" type="button" onclick={() => (confirmOpen = true)}>
          Delete team
        </Button>
        {#if confirmResult}
          <p class="mt-3 text-xs text-text-muted">{confirmResult}</p>
        {/if}
        <ConfirmDialog
          open={confirmOpen}
          title="Delete team"
          description="This cannot be undone. The roster is removed from the season."
          confirmLabel="Delete"
          onConfirm={() => {
            confirmResult = 'Deleted';
            confirmOpen = false;
          }}
          onCancel={() => (confirmOpen = false)}
        />
      </Card>
    </div>
  </section>

  <section class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold text-white">Tooltip — shipping</h2>
      <p class="text-sm text-text-body">
        Unstyled trigger wrapping children so Badge pills keep their look. Hover or Tab.
      </p>
    </div>
    <Card>
      <div class="flex flex-wrap items-center gap-4">
        <Badge color="green" tooltip="Appears on hover and keyboard focus">Ready</Badge>
        <Badge color="orange" tooltip="Tab onto the badge">Brand</Badge>
      </div>
    </Card>
  </section>

  <section class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold text-white">Checkbox — not yet</h2>
      <p class="text-sm text-text-body">
        Native checkboxes follow the OS. Bits gives a custom box, focus ring, and mixed
        (indeterminate) state.
      </p>
    </div>
    <div class="grid gap-6 lg:grid-cols-2">
      <Card>
        {#snippet header()}
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-white">Current</h3>
            <Badge color="zinc">native input</Badge>
          </div>
        {/snippet}
        <label
          for="native-check"
          class="flex items-center gap-3 text-sm font-medium text-text-label"
        >
          <input
            id="native-check"
            type="checkbox"
            bind:checked={nativeChecked}
            class="size-4 accent-primary-600"
          />
          Ready to play
        </label>
        <p class="mt-3 text-xs text-text-muted">Checked: {nativeChecked}</p>
      </Card>
      <Card>
        {#snippet header()}
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-white">Bits UI</h3>
            <Badge color="zinc">later</Badge>
          </div>
        {/snippet}
        <div class="space-y-3">
          <BitsCheckbox
            id="bits-ready"
            label="Ready to play"
            name="bitsChecked"
            bind:checked={bitsChecked}
          />
          <BitsCheckbox
            id="bits-mixed"
            label="Some maps selected (mixed)"
            bind:checked={bitsMixedChecked}
            bind:indeterminate={bitsIndeterminate}
          />
        </div>
        <p class="mt-3 text-xs text-text-muted">
          Checked: {bitsChecked} · mixed checked: {bitsMixedChecked} · mixed: {bitsIndeterminate}
        </p>
      </Card>
    </div>
  </section>

  <section class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold text-white">Switch — not yet</h2>
      <p class="text-sm text-text-body">
        We do not have this primitive. The fallback is a checkbox.
      </p>
    </div>
    <div class="grid gap-6 lg:grid-cols-2">
      <Card>
        {#snippet header()}
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-white">Current</h3>
            <Badge color="zinc">no switch</Badge>
          </div>
        {/snippet}
        <label
          for="native-toggle"
          class="flex items-center gap-3 text-sm font-medium text-text-label"
        >
          <input
            id="native-toggle"
            type="checkbox"
            bind:checked={nativeToggle}
            class="size-4 accent-primary-600"
          />
          Enable invites (checkbox stand-in)
        </label>
      </Card>
      <Card>
        {#snippet header()}
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-white">Bits UI</h3>
            <Badge color="zinc">later</Badge>
          </div>
        {/snippet}
        <BitsSwitch
          id="bits-invites"
          label="Enable invites"
          name="bitsSwitch"
          bind:checked={bitsSwitch}
        />
        <p class="mt-3 text-xs text-text-muted">On: {bitsSwitch}</p>
      </Card>
    </div>
  </section>

  <section class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold text-white">Dropdown menu — not yet</h2>
      <p class="text-sm text-text-body">
        Account / notifications / leagues stay click-outside. Bits would add arrows, nested menus,
        and portal.
      </p>
    </div>
    <div class="grid gap-6 lg:grid-cols-2">
      <Card>
        {#snippet header()}
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-white">Current</h3>
            <Badge color="zinc">click-outside</Badge>
          </div>
        {/snippet}
        <HandmadeDropdown bind:lastAction={handmadeMenuAction} />
        <p class="mt-3 text-xs text-text-muted">
          Last action: {handmadeMenuAction || '(none)'} · arrows do not move highlight
        </p>
      </Card>
      <Card>
        {#snippet header()}
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-white">Bits UI</h3>
            <Badge color="zinc">later</Badge>
          </div>
        {/snippet}
        <BitsDropdownMenu bind:lastAction={bitsMenuAction} />
        <p class="mt-3 text-xs text-text-muted">
          Last action: {bitsMenuAction || '(none)'} · arrows, then open My Teams
        </p>
      </Card>
    </div>
  </section>
</div>
