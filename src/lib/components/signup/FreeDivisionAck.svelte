<script lang="ts">
  import { FREE_DIVISION_ACK_FIELD } from '$lib/utils/signupDivision';
  import { SIGNUP_CHECKBOX_CLASS } from '$lib/utils/signupAck';

  let { visible }: { visible: boolean } = $props();
</script>

{#if visible}
  <div class="mb-6">
    <label for="signup-free-division-ack" class="flex items-start gap-3 cursor-pointer">
      <input
        id="signup-free-division-ack"
        type="checkbox"
        name={FREE_DIVISION_ACK_FIELD}
        required
        class={SIGNUP_CHECKBOX_CLASS}
      />
      <span class="text-sm text-text-label">
        I understand I selected a free division. If administrators later place me in a paid
        division, I must pay to participate.
      </span>
    </label>
  </div>
{/if}
