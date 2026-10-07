import { describe, expect, it } from 'vitest';
import type { AnswerInput } from '../shared/types';
import { createOutbox } from '../src/outbox';
class MemoryStorage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}
const input = (operationId: string, cardId = 'museum'): AnswerInput => ({ operationId, cardId, tripVersion: 'v1', choice: 'interested', expectedRevision: 0 });
describe('independent invitation outbox records', () => {
  it('preserves two tabs independent offline answers when reopening', () => {
    const storage = new MemoryStorage();
    const firstTab = createOutbox(storage, 'trip:invite-a');
    const secondTab = createOutbox(storage, 'trip:invite-a');
    firstTab.add(input('first', 'museum'));
    secondTab.add(input('second', 'garden'));
    expect(createOutbox(storage, 'trip:invite-a').list().map(item => item.operationId)).toEqual(['first', 'second']);
  });
  it('isolates pending operations from other invitation tokens', () => {
    const storage = new MemoryStorage();
    createOutbox(storage, 'trip:invite-a').add(input('first'));
    createOutbox(storage, 'trip:invite-b').add(input('second'));
    expect(createOutbox(storage, 'trip:invite-a').list().map(item => item.operationId)).toEqual(['first']);
  });
  it('acknowledging one tab operation cannot delete another tab operation', () => {
    const storage = new MemoryStorage();
    const firstTab = createOutbox(storage, 'trip:invite-a');
    const secondTab = createOutbox(storage, 'trip:invite-a');
    firstTab.add(input('first')); secondTab.add(input('second'));
    firstTab.remove(['first']);
    expect(secondTab.list().map(item => item.operationId)).toEqual(['second']);
  });
  it('deduplicates an operation on replay without changing its stable input', () => {
    const storage = new MemoryStorage(); const box = createOutbox(storage, 'trip:invite-a');
    box.add(input('stable')); box.add({ ...input('stable'), choice: 'not_interested' });
    expect(box.list()).toEqual([input('stable')]);
  });
  it('conflict cleanup removes only the known operations even after a new tab writes', () => {
    const storage = new MemoryStorage(); const tab = createOutbox(storage, 'trip:invite-a');
    tab.add(input('conflict')); tab.add(input('known-followup'));
    const known = tab.list().map(item => item.operationId);
    createOutbox(storage, 'trip:invite-a').add(input('concurrent-new'));
    tab.remove(known);
    expect(tab.list().map(item => item.operationId)).toEqual(['concurrent-new']);
  });
});
