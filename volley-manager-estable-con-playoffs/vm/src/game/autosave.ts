import { deserializeSession, type SaveMeta, type SaveSession, type SaveStore } from './save';

export interface AutoRecovery {
  session: SaveSession | null;
  source: 'auto' | 'auto-backup' | 'none';
}

/**
 * Preserves the previous valid autosave before replacing it.
 * Call inside the application's write queue so reads and writes cannot race.
 */
export async function writeAutoWithBackup(
  store: SaveStore,
  json: string,
  meta: SaveMeta,
): Promise<void> {
  // Never replace a known-good backup with corrupt data from the current slot.
  const current = await store.get('auto');
  if (current !== null) {
    try {
      deserializeSession(current);
      const backupMeta = { ...metaOfBackup(meta), ...metaOfBackupFromCurrent(meta) };
      await store.put('auto-backup', current, backupMeta);
    } catch {
      // A corrupt current slot is not a valid recovery point.
    }
  }
  await store.put('auto', json, meta);
}

function metaOfBackup(meta: SaveMeta): SaveMeta {
  return { ...meta, slot: 'auto-backup' };
}
function metaOfBackupFromCurrent(meta: SaveMeta): Partial<SaveMeta> {
  return { savedAt: meta.savedAt };
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
