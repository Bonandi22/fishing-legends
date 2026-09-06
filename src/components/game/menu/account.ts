export const ACCOUNT_KEY = 'fishing-game-account';
export const TUTORIAL_KEY = 'fishing-game-tutorial-seen';

export interface Account {
  email: string;
  birthdate: string;
  username?: string;
  country?: string;
}

export const COUNTRIES = [
  '🇧🇷', '🇵🇹', '🇺🇸', '🇪🇸', '🇫🇷', '🇩🇪', '🇮🇹', '🇬🇧',
  '🇯🇵', '🇰🇷', '🇲🇽', '🇦🇷', '🇨🇦', '🇦🇺', '🇨🇳', '🌍',
];

export function loadAccount(): Account | null {
  try {
    const saved = localStorage.getItem(ACCOUNT_KEY);
    if (saved) return JSON.parse(saved) as Account;
  } catch {
    return null;
  }
  return null;
}

export function saveAccount(acc: Account) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc));
}
