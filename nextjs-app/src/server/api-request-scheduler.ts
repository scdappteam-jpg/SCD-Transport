// Legacy operations share mutable workflow state. Only explicitly isolated
// readers may bypass this queue; arbitrary GET handlers can still mutate state.
export function createApiRequestScheduler() {
  let writes: Promise<unknown> = Promise.resolve();
  return <T>(independent: boolean, work: () => Promise<T>): Promise<T> => {
    if (independent) return work();
    const result = writes.catch(() => {}).then(work);
    writes = result.catch(() => {});
    return result;
  };
}
