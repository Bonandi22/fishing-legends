export type { NetType } from '@/game/netTypes';
export { NET_TYPES, rollNet } from '@/game/netTypes';
import { rollNet } from '@/game/netTypes';

/** @deprecated use `rollNet` from `@/game/netTypes`. */
export const randomNet = () => rollNet();
