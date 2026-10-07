import type { AnswerInput, Answer, SessionResponse, TripStats, InviteResponse } from '../shared/types';
import type { ErrorCode } from '../shared/errors';
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
export class ApiError extends Error {
  constructor(public status: number, message: string, public answer?: Answer | null, public code?: ErrorCode, public params?: Record<string,string|number>) { super(message); }
}
export async function request<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } });
  const payload = await response.json().catch(() => ({ error: 'Invalid server response' }));
  if (!response.ok) throw new ApiError(response.status, payload.error || 'Request failed', payload.answer, payload.errorCode, payload.params);
  return payload as T;
}
export const getSession = (token: string) => request<SessionResponse>('/api/session', token);
export const saveAnswer = (tripId: string, token: string, input: AnswerInput) => request<{ answer: Answer }>(`/api/trips/${encodeURIComponent(tripId)}/answers`, token, { method: 'PUT', body: JSON.stringify(input) });
export const getStats = (tripId: string, key: string) => request<TripStats>(`/api/trips/${encodeURIComponent(tripId)}/stats`, key);
export const createInvite = (tripId: string, key: string, name: string) => request<InviteResponse>(`/api/trips/${encodeURIComponent(tripId)}/invites`, key, { method: 'POST', body: JSON.stringify({ name }) });
export const revokeInvite = (tripId: string, key: string, participantId: string) => request<{ ok: true }>(`/api/trips/${encodeURIComponent(tripId)}/invites/${encodeURIComponent(participantId)}/revoke`, key, { method: 'POST' });
export async function exportTrip(tripId: string, key: string) {
  const data = await request<unknown>(`/api/trips/${encodeURIComponent(tripId)}/export?format=json`, key);
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `${tripId}-answers.json`; link.click(); URL.revokeObjectURL(url);
}
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
