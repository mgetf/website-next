import { setContext, getContext } from 'svelte';

const KEY = Symbol('bracket-hover');

export class BracketHover {
  label = $state<string | null>(null);
}

export function initBracketHover(): BracketHover {
  const hover = new BracketHover();
  setContext(KEY, hover);
  return hover;
}

const FALLBACK = new BracketHover();

export function useBracketHover(): BracketHover {
  return getContext<BracketHover>(KEY) ?? FALLBACK;
}
