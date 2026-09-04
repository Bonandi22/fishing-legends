export interface KeyValueStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const browserStorage: KeyValueStorage = {
  get: key => localStorage.getItem(key),
  set: (key, value) => localStorage.setItem(key, value),
  remove: key => localStorage.removeItem(key),
};
