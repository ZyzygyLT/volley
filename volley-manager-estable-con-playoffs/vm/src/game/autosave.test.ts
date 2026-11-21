import { describe, expect, it } from 'vitest';
import { newGame } from './season';
import { metaOf, memoryStore, serializeSession } from './save';
import { recoverAuto, writeAutoWithBackup } from './autosave';

const session = (seed: number) => {
  const game = newGame(seed);
  return { game, json: serializeSession(game, null, 'liga') };
};

describe('recuperación del autoguardado', () => {
  it('conserva la versión anterior válida antes de sobrescribir auto', async () => {
    const store = memoryStore();
    const first = session(101);
    const second = session(102);
    await writeAutoWithBackup(store, first.json, metaOf('auto', first.game, '2026-11-21T10:00:00.000Z'));
    await writeAutoWithBackup(store, second.json, metaOf('auto', second.game, '2026-11-21T10:01:00.000Z'));

    expect((await store.get('auto'))).toBe(second.json);
    expect((await store.get('auto-backup'))).toBe(first.json);
    expect((await store.list()).find(x => x.slot === 'auto-backup')?.team).toBe(first.game.teams[first.game.userTeam].name);
  });

  it('no sobrescribe auto si no puede guardar primero la copia de seguridad', async () => {
    const base = memoryStore();
    const first = session(113);
    const second = session(114);
    await writeAutoWithBackup(base, first.json, metaOf('auto', first.game, new Date().toISOString()));
    const failingStore = {
      ...base,
      async put(slot: string, json: string, meta: ReturnType<typeof metaOf>) {
        if (slot === 'auto-backup') throw new Error('backup write failed');
        await base.put(slot, json, meta);
      },
    };
    await expect(writeAutoWithBackup(failingStore, second.json, metaOf('auto', second.game, new Date().toISOString()))).rejects.toThrow('backup write failed');
    expect(await base.get('auto')).toBe(first.json);
  });

  it('usa auto cuando la copia principal es válida', async () => {
    const store = memoryStore();
    const first = session(103);
    const second = session(104);
    await writeAutoWithBackup(store, first.json, metaOf('auto', first.game, new Date().toISOString()));
    await writeAutoWithBackup(store, second.json, metaOf('auto', second.game, new Date().toISOString()));

    const result = await recoverAuto(store);
    expect(result.source).toBe('auto');
    expect(result.session?.game.seed).toBe(104);
  });

  it('recupera el respaldo cuando auto está corrupto y repara la ranura principal', async () => {
    const store = memoryStore();
    const first = session(105);
    const second = session(106);
    await writeAutoWithBackup(store, first.json, metaOf('auto', first.game, new Date().toISOString()));
    await writeAutoWithBackup(store, second.json, metaOf('auto', second.game, new Date().toISOString()));
    await store.put('auto', '{"corrupt":', metaOf('auto', second.game, new Date().toISOString()));

    const result = await recoverAuto(store);
    expect(result.source).toBe('auto-backup');
    expect(result.session?.game.seed).toBe(105);
    expect(await store.get('auto')).toBe(first.json);
    expect(await store.get('auto-backup')).toBe(first.json);
  });

  it('recupera el respaldo si la ranura principal fue borrada', async () => {
    const store = memoryStore();
    const first = session(107);
    const second = session(108);
    await writeAutoWithBackup(store, first.json, metaOf('auto', first.game, new Date().toISOString()));
    await writeAutoWithBackup(store, second.json, metaOf('auto', second.game, new Date().toISOString()));
    await store.remove('auto');

    const result = await recoverAuto(store);
    expect(result.source).toBe('auto-backup');
    expect(result.session?.game.seed).toBe(107);
    expect(await store.get('auto')).toBe(first.json);
  });

  it('no inventa una recuperación cuando ambas copias faltan o son inválidas', async () => {
    const store = memoryStore();
    expect(await recoverAuto(store)).toEqual({ session: null, source: 'none' });
    await store.put('auto', 'bad json', metaOf('auto', session(109).game, new Date().toISOString()));
    await store.put('auto-backup', 'also bad', metaOf('auto-backup', session(110).game, new Date().toISOString()));
    await expect(recoverAuto(store)).rejects.toThrow();
  });

  it('borrar auto no borra automáticamente el respaldo', async () => {
    const store = memoryStore();
    const first = session(111);
    const second = session(112);
    await writeAutoWithBackup(store, first.json, metaOf('auto', first.game, new Date().toISOString()));
    await writeAutoWithBackup(store, second.json, metaOf('auto', second.game, new Date().toISOString()));
    await store.remove('auto');
    expect(await store.get('auto-backup')).toBe(first.json);
  });
});
