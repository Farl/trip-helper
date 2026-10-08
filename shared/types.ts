import type { Locale, TripTranslation } from './localization.js';
/** The answer is always binary. An absent answer means the card was not answered. */
export type Choice = 'interested' | 'not_interested';
export interface CardImage { url: string; alt: string; credit: string; sourceUrl: string }
/** Preview boundaries refer to the original video timeline; embedding does not create a local copy. */
export interface CardVideo {
  url:string; kind:'file'|'embed'; poster?:string; startSeconds?:number; endSeconds?:number;
  credit?:string; sourceUrl?:string;
}
export interface TripCard {
  id: string; placeId: string; title: string; description: string; category: string;
  tags: string[]; image?: CardImage;
  video?: CardVideo;
  source: { url: string; title: string; checkedAt: string };
  facts: { duration: string; cost: string; mobility: string; seasonalNote?: string };
}
export interface Trip {
  id: string; version: string; title: string; destination: string;
  startsOn: string; endsOn: string; audience: { minAge: number; maxAge: number };
  intro: string; cards: TripCard[];
}
export interface TripSummary {
  id: string; title: string; destination: string; startsOn: string; endsOn: string;
  cardCount: number; cover?: string;
}
export interface Answer {
  cardId: string; choice: Choice; revision: number; updatedAt: string;
}
export interface Participant {
  id: string; name: string; tripId: string; tripVersion: string;
  createdAt: string; revoked: boolean;
}
export interface SessionResponse { participant: Participant; answers: Answer[]; trip?: Trip; translations?: Partial<Record<Locale,TripTranslation>> }
export interface AnswerInput {
  operationId: string; cardId: string; tripVersion: string;
  choice: Choice; expectedRevision: number; displayLocale?: Locale;
}
export interface AnswerEvent extends AnswerInput {
  participantId: string; tripId: string; recordedAt: string; revision: number;
}
export interface CardStats { cardId: string; interested: number; notInterested: number; unanswered: number }
export interface TripStats {
  tripId: string; participants: (Participant & { answered: number; total: number })[];
  cards: CardStats[];
}
export interface InviteResponse { participant: Participant; token: string }
