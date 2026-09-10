/** Shared native-checkbox chrome for signup acknowledgments (matches checkout). */
export const SIGNUP_CHECKBOX_CLASS =
  'mt-0.5 w-4 h-4 shrink-0 rounded border-border-input bg-surface-input accent-primary-600 focus:ring-primary-500 focus:ring-offset-zinc-900';

export const SIGNUP_SCOPE_ACK_FIELD = 'signupScopeAck';

export function signupScopeAckLabel(params: {
  regionName?: string | null;
  formatName: string;
  seasonNum?: number | null;
}): string {
  const parts: string[] = [];
  if (params.regionName) parts.push(params.regionName);
  parts.push(params.formatName);
  if (params.seasonNum != null) parts.push(`Season ${params.seasonNum}`);
  return `I confirm that I am signing up for: ${parts.join(' ')}.`;
}

export function formAcknowledgedSignupScope(formData: FormData): boolean {
  const value = formData.get(SIGNUP_SCOPE_ACK_FIELD);
  return value === 'on' || value === 'true' || value === '1';
}
