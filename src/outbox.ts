import type { AnswerInput } from '../shared/types';
export type OutboxStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
interface PendingRecord<T> { input: T; queuedAt: number }
/** Each operation owns a storage key. A stale tab can never replace another tab's queue. */
export function createOutbox<T extends { operationId: string } = AnswerInput>(storage: OutboxStorage, scope: string) {
  const volatile = new Map<string,PendingRecord<T>>();
  const prefix = `${scope}:operation:`;
  const operationKey = (id: string) => `${prefix}${encodeURIComponent(id)}`;
  function records(): PendingRecord<T>[] {
    const result: PendingRecord<T>[] = [...volatile.values()];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index); if (!key?.startsWith(prefix)) continue;
      try {
        const record = JSON.parse(storage.getItem(key) ?? 'null') as PendingRecord<T> | null;
        if (record?.input && key === operationKey(record.input.operationId) && Number.isFinite(record.queuedAt)) if (!volatile.has(record.input.operationId)) result.push(record);
      } catch { /* A corrupt record must not prevent recovery of the other pending operations. */ }
    }
    return result.sort((a, b) => a.queuedAt - b.queuedAt || a.input.operationId.localeCompare(b.input.operationId));
  }
  function list() { return records().map(record => record.input); }
  function add(input: T) {
    const key = operationKey(input.operationId);
    if (volatile.has(input.operationId) || storage.getItem(key) !== null) return;
    const queue = records();
    const queuedAt = Math.max(Date.now(), (queue.at(-1)?.queuedAt ?? 0) + 1);
    const record = { input, queuedAt } satisfies PendingRecord<T>;
    // Keep a volatile copy until the browser accepts the write. A readable but
    // full store must not erase queued operations on the next list()/acknowledgement.
    volatile.set(input.operationId,record);
    storage.setItem(key, JSON.stringify(record));
    volatile.delete(input.operationId);
  }
  function remove(ids: string[]) { for (const id of ids) { volatile.delete(id); storage.removeItem(operationKey(id)); } }
  return { prefix, list, add, remove };
}
