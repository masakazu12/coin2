// STEP 7: LINKS (exact port of links.py)
// Every FOMO link the desk produces goes strictly through these helpers.

export const CHAIN_ID: Record<string, number> = {
  solana: 1399811149,
  robinhood: 4663,
  base: 8453,
  bnb: 56,
};

export const SIGNUP_URL = 'https://fomo.family/r/savipww';

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HANDLE_RE = /^[a-zA-Z0-9_.-]{1,32}$/;

export function isValidSolanaMint(address: string): boolean {
  return BASE58_RE.test(address.trim());
}

export function coinUrl(address: string, chain: string = 'solana'): string {
  const cleanAddr = address.trim();
  const chainKey = chain.toLowerCase();
  if (!(chainKey in CHAIN_ID) || !isValidSolanaMint(cleanAddr)) {
    return SIGNUP_URL;
  }
  return `https://fomo.family/coin?address=${encodeURIComponent(cleanAddr)}&chainId=${CHAIN_ID[chainKey]}&r=savipww&source=share_link`;
}

export function profileUrl(handle: string): string {
  const clean = handle.trim().replace(/^@+/, '');
  if (!HANDLE_RE.test(clean)) {
    return SIGNUP_URL;
  }
  return `https://fomo.family/profile/${encodeURIComponent(clean)}?source=share_link&r=savipww`;
}
