export const COUNTRIES = ['🇧🇷','🇵🇹','🇺🇸','🇪🇸','🇫🇷','🇩🇪','🇮🇹','🇬🇧','🇯🇵','🇰🇷','🇲🇽','🇦🇷','🇨🇦','🇦🇺','🇨🇳','🌍'] as const;

const FLAG_TO_ISO: Record<string, string> = {
  '🇧🇷': 'BR', '🇵🇹': 'PT', '🇺🇸': 'US', '🇪🇸': 'ES', '🇫🇷': 'FR', '🇩🇪': 'DE',
  '🇮🇹': 'IT', '🇬🇧': 'GB', '🇯🇵': 'JP', '🇰🇷': 'KR', '🇲🇽': 'MX', '🇦🇷': 'AR',
  '🇨🇦': 'CA', '🇦🇺': 'AU', '🇨🇳': 'CN', '🌍': 'ZZ',
};
const ISO_TO_FLAG: Record<string, string> = Object.fromEntries(
  Object.entries(FLAG_TO_ISO).map(([flag, iso]) => [iso, flag]),
);

export function flagToIso2(flag: string): string { return FLAG_TO_ISO[flag] ?? 'ZZ'; }
export function iso2ToFlag(iso: string): string { return ISO_TO_FLAG[iso?.toUpperCase()] ?? '🌍'; }
