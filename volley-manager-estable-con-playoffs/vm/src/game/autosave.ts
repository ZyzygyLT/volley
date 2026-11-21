import { deserializeSession, type SaveMeta, type SaveSession, type SaveStore } from './save';

const withAutoLock = <T,>(operation: () => Promise<T>): Promise<T> => {
  if (typeof navigator === 'undefined' || !navigator.locks) return operation();
  return navigator.locks.request('volley-manager:auto-save', { mode: 'exclusive' }, operation);
};

/** Preserves the previous valid autosave before replacing it. Call inside the write queue. */
export function writeAutoWithBackup(store: SaveStore, json: string, meta: SaveMeta): Promise<void> {
  return withAutoLock(async () => {
    const current = await store.get('auto');
    let currentIsValid = false;
    if (current !== null) {
      try {
        deserializeSession(current);
        currentIsValid = true;
      } catch {
        // A corrupt primary slot is not a recovery point.
      }
    }
    if (current !== null && currentIsValid) {
      // Fail closed: if the backup cannot be written, keep the current primary untouched.
      const previousMeta = (await store.list()).find(item => item.slot === 'auto');
      const backupMeta: SaveMeta = previousMeta
        ? { ...previousMeta, slot: 'auto-backup' }
        : { ...meta, slot: 'auto-backup' };
      await store.put('auto-backup', current, backupMeta);
    }
    await store.put('auto', json, meta);
  });
}

export interface AutoRecovery {
  session: SaveSession | null;
  source: 'auto' | 'auto-backup' | 'none';
}

/** Reads the newest valid autosave; repairs the primary slot when backup was needed. */
export function recoverAuto(store: SaveStore): Promise<AutoRecovery> {
  return withAutoLock(async () => {
    const primary = await store.get('auto');
    if (primary !== null) {
      try {
        return { session: deserializeSession(primary), source: 'auto' };
      } catch {
        // Fall through to the previous validated copy.
      }
    }
    const backup = await store.get('auto-backup');
    if (backup !== null) {
      const session = deserializeSession(backup);
      const game = session.game;
      const meta: SaveMeta = {
        slot: 'auto',
        savedAt: new Date().toISOString(),
        team: game.teams[game.userTeam].name,
        round: game.round,
      };
      await store.put('auto', backup, meta);
      return { session, source: 'auto-backup' };
    }
    return { session: null, source: 'none' };
  });
}
