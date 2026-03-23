<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';
  import FilterBar from '$lib/components/ui/FilterBar.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';

  let { data }: { data: PageData } = $props();

  let showReviewed = $state(true);
  let showRejected = $state(true);
  let isSubmitting = $state(false);

  let filteredReports = $derived(
    data.demoReports.filter((report) => {
      if (report.status === 'REVIEW') return true;
      if (report.status === 'ACTION' && showReviewed) return true;
      if (report.status === 'CLEAR' && showRejected) return true;
      return false;
    }),
  );

  function getStatusLabel(status: string): string {
    switch (status) {
      case 'REVIEW':
        return 'Pending';
      case 'ACTION':
        return 'Reviewed';
      case 'CLEAR':
        return 'Rejected';
      default:
        return status;
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'REVIEW':
        return 'bg-warning-500 text-black';
      case 'ACTION':
        return 'bg-success-500 text-white';
      case 'CLEAR':
        return 'bg-danger-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  }
</script>

<div class="max-w-7xl mx-auto space-y-6">
  <!-- Page Header -->
  <div>
    <h2 class="text-3xl font-bold text-white mb-2">Demo Reports</h2>
    <p class="text-text-body">Review and manage reported game demos</p>
  </div>

  <!-- Filters -->
  <FilterBar>
    {#snippet filters()}
      <label class="flex items-center gap-2 text-text-label cursor-pointer">
        <input
          type="checkbox"
          bind:checked={showReviewed}
          class="w-4 h-4 rounded border-border-input bg-surface-input text-primary-500 focus:ring-primary-500"
        />
        <span class="text-sm font-medium">Show Reviewed</span>
      </label>
      <label class="flex items-center gap-2 text-text-label cursor-pointer">
        <input
          type="checkbox"
          bind:checked={showRejected}
          class="w-4 h-4 rounded border-border-input bg-surface-input text-primary-500 focus:ring-primary-500"
        />
        <span class="text-sm font-medium">Show Rejected</span>
      </label>
    {/snippet}
  </FilterBar>

  <!-- Reports List -->
  <div class="space-y-4">
    {#if filteredReports.length === 0}
      <Card padding="none" class="p-12 text-center">
        <div class="text-6xl mb-4">📹</div>
        <h3 class="text-xl font-bold text-white mb-2">No Demo Reports</h3>
        <p class="text-text-body">
          {data.demoReports.length === 0
            ? 'No demo reports have been submitted yet.'
            : 'No reports match your current filters.'}
        </p>
      </Card>
    {:else}
      {#each filteredReports as report}
        <Card padding="lg">
          <div class="flex items-start justify-between mb-4">
            <div class="space-y-2">
              <h3 class="text-lg font-bold text-white">
                Reported by:
                <a
                  href="/users/{report.reporter?.steamId}"
                  class="text-info-400 hover:text-blue-300 transition-colors"
                >
                  {report.reporter?.steamUsername || 'Unknown User'}
                </a>
              </h3>
              <p class="text-sm text-text-body">
                Reported at: {new Date(report.reportedAt).toLocaleString()}
              </p>
            </div>

            <span class="px-3 py-1 text-sm font-medium rounded {getStatusColor(report.status)}">
              {getStatusLabel(report.status)}
            </span>
          </div>

          <!-- Report Details -->
          <div class="space-y-3 mb-4">
            <div>
              <h4 class="text-sm font-medium text-text-body mb-1">Player Reported:</h4>
              <a
                href="/users/{report.demo.player?.steamId}"
                class="text-info-400 hover:text-blue-300 transition-colors"
              >
                {report.demo.player?.steamUsername || 'Unknown Player'}
              </a>
            </div>

            <div>
              <h4 class="text-sm font-medium text-text-body mb-1">Description:</h4>
              <p class="text-white">{report.description || 'No description provided'}</p>
            </div>

            {#if report.adminComments}
              <div>
                <h4 class="text-sm font-medium text-text-body mb-1">Admin Comments:</h4>
                <p class="text-white">{report.adminComments}</p>
              </div>
            {/if}

            {#if report.admin}
              <div>
                <h4 class="text-sm font-medium text-text-body mb-1">Reviewed by:</h4>
                <span class="text-white">{report.admin.steamUsername}</span>
              </div>
            {/if}
          </div>

          <!-- Demo Link -->
          <div class="mb-4 flex items-center gap-3">
            <Button
              variant="primary"
              href={report.demo.file}
              target="_blank"
              class="inline-flex items-center gap-2"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download Demo
            </Button>

            {#if report.demo.match}
              <Button variant="secondary" href="/matches/{report.demo.match.id}">View Match</Button>
            {/if}
          </div>

          <!-- Update Form -->
          <form
            method="POST"
            action="?/updateReport"
            use:enhance={() => {
              isSubmitting = true;
              return async ({ update }) => {
                await update();
                isSubmitting = false;
              };
            }}
            class="border-t border-border-default pt-4 space-y-3"
          >
            <input type="hidden" name="reportId" value={report.id} />

            <div class="flex gap-4">
              <div class="flex-1">
                <FormSelect
                  label="Status"
                  name="status"
                  value={report.status}
                  required
                  options={[
                    { value: 'REVIEW', label: 'Pending' },
                    { value: 'ACTION', label: 'Reviewed' },
                    { value: 'CLEAR', label: 'Rejected' },
                  ]}
                />
              </div>

              <div class="flex-1">
                <label
                  for="comments-{report.id}"
                  class="block text-sm font-medium text-text-label mb-2"
                >
                  Admin Comments:
                </label>
                <textarea
                  id="comments-{report.id}"
                  name="adminComments"
                  value={report.adminComments || ''}
                  rows="1"
                  placeholder="Leave a comment..."
                  class="w-full px-3 py-2 bg-surface-input border border-border-input rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                ></textarea>
              </div>
            </div>

            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Update Status'}
            </Button>
          </form>
        </Card>
      {/each}
    {/if}
  </div>
</div>
