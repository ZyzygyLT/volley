import { describe, expect, it } from 'vitest';
import { createWriteQueue } from './writeQueue';

describe('createWriteQueue', () => {
  it('ejecuta las escrituras en orden y espera a que termine la anterior', async () => {
    const queue = createWriteQueue();
    const order: string[] = [];
    let release!: () => void;
    const first = queue(async () => {
      order.push('primera:inicio');
      await new Promise<void>(resolve => { release = resolve; });
      order.push('primera:fin');
    });
    const second = queue(async () => { order.push('segunda'); });

    expect(order).toEqual(['primera:inicio']);
    await Promise.resolve();
    expect(order).toEqual(['primera:inicio']);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['primera:inicio', 'primera:fin', 'segunda']);
  });

  it('continúa con la siguiente escritura aunque una anterior falle', async () => {
    const queue = createWriteQueue();
    const order: string[] = [];
    const failed = queue(async () => { order.push('fallida'); throw new Error('fallo esperado'); });
    const next = queue(async () => { order.push('siguiente'); return 42; });

    await expect(failed).rejects.toThrow('fallo esperado');
    await expect(next).resolves.toBe(42);
    expect(order).toEqual(['fallida', 'siguiente']);
  });
});
