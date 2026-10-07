import type { AnswerInput } from '../shared/types';
export type OutboxStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
interface PendingRecord { input: AnswerInput; queuedAt: number }
/** Each operation owns a storage key. A stale tab can never replace another tab's queue. */
export function createOutbox(storage: OutboxStorage, scope: string) {
  const prefix = `${scope}:operation:`;
  const operationKey = (id: string) => `${prefix}${encodeURIComponent(id)}`;
  function records(): PendingRecord[] {
    const result: PendingRecord[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index); if (!key?.startsWith(prefix)) continue;
      try {
        const record = JSON.parse(storage.getItem(key) ?? 'null') as PendingRecord | null;
        if (record?.input && key === operationKey(record.input.operationId) && Number.isFinite(record.queuedAt)) result.push(record);
      } catch { /* A corrupt record must not prevent recovery of the other pending operations. */ }
    }
    return result.sort((a, b) => a.queuedAt - b.queuedAt || a.input.operationId.localeCompare(b.input.operationId));
  }
  function list() { return records().map(record => record.input); }
  function add(input: AnswerInput) {
    const key = operationKey(input.operationId);
    if (storage.getItem(key) !== null) return;
    const queue = records();
    const queuedAt = Math.max(Date.now(), (queue.at(-1)?.queuedAt ?? 0) + 1);
    storage.setItem(key, JSON.stringify({ input, queuedAt } satisfies PendingRecord));
  }
  function remove(ids: string[]) { for (const id of ids) storage.removeItem(operationKey(id)); }
  return { prefix, list, add, remove };
}
