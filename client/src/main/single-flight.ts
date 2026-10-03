export function createSingleFlight<T>(operation: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;

  return () => {
    if (pending) return pending;

    const current = operation();
    pending = current;
    void current.then(
      () => { if (pending === current) pending = null; },
      () => { if (pending === current) pending = null; }
    );
    return current;
  };
}
