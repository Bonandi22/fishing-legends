import type { Fish } from './types';

/** A fish the server (or the local roll) hooked, pending the minigame. */
export type Hooked = { fish: Fish; weight: number; lucky: boolean; sessionId: string };
