export type WriteQueue = <T>(operation: () => Promise<T>) => Promise<T>;

/**
 * Serializa escrituras asíncronas y permite continuar después de un fallo.
 * La primera operación comienza sincrónicamente para no retrasar el flush de pagehide.
 */
export function createWriteQueue(): WriteQueue {
  let tail: Promise<void> | null = null;
  return <T>(operation: () => Promise<T>): Promise<T> => {
    let current: Promise<T>;
    if (tail === null) {
      try {
        current = Promise.resolve(operation());
      } catch (error) {
        current = Promise.reject(error);
      }
    } else {
      current = tail.then(operation, operation);
    }
    const next = current.then(() => undefined, () => undefined);
    tail = next;
    void next.then(() => {
      if (tail === next) tail = null;
    });
    return current;
  };
}
