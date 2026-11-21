import { deserializeSession, type SaveMeta, type SaveSession, type SaveStore } from './save';

export interface AutoRecovery {
  session: SaveSession | null;
  source: 'auto' | 'auto-backup' | 'none';
}

/** Preserves the previous valid autosave before replacing it. Call inside the write queue. */
export async function writeAutoWithBackup(store: SaveStore, json: string, meta: SaveMeta): Promise<void> {
  const current = await store.get('auto');
  if (current !== null) {
    try {
      deserializeSession(current);
      const previousMeta = (await store.list()).find(item => item.slot === 'auto');
      const backupMeta: SaveMeta = previousMeta
        ? { ...previousMeta, slot: 'auto-backup' }
        : { ...meta, slot: 'auto-backup' };
      await store.put('auto-backup', current, backupMeta);
    } catch {
      // Do not replace a known-good backup with a corrupt primary slot.
    }
  }
  await store.put('auto', json, meta);
}

/** Reads the newest valid autosave; repairs the primary slot when backup was needed. */
export async function recoverAuto(store: SaveStore): Promise<AutoRecovery> {
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
}
