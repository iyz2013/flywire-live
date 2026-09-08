export let TOKEN_ADDRESS = (new URLSearchParams(location.search).get('token') || window.__siteConfig?.homeToken || import.meta.env.NEXT_PUBLIC_TOKEN_ADDRESS || '0x39dbed3a2bd333467115de45665cc57f813c4571').toLowerCase();
export const QUOTE_SYMBOL = 'USD';
export const POLL_MS = 2000;
export const MIN_NOTIONAL_USD = 1;
export const MAX_EVENTS_PER_SEC = 8;
export const COOLDOWN_MS = 2500;

export function setTokenAddress(value) { TOKEN_ADDRESS = value.toLowerCase(); }
