import type { Towels } from './types';
export const linenCount = (bag: Towels) => bag.clean + bag.dirty + (bag.cleanSheets ?? 0) + (bag.dirtySheets ?? 0);
export const dirtyLinenCount = (bag: Towels) => bag.dirty + (bag.dirtySheets ?? 0);
