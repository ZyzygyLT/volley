export type WriteQueue = <T>(operation: () => Promise<T>) => Promise<T>;

/**
 * Serializa escrituras asíncronas y permite continuar después de un fallo.
 * Evita que un autoguardado anterior termine después de uno más reciente.
 */
export function createWriteQueue(): WriteQueue {
  let tail: Promise<void> = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const current = tail.then(operation, operation);
    tail = current.then(() => undefined, () => undefined);
    return current;
  };
}
