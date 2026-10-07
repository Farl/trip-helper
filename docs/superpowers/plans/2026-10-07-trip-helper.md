# Trip Helper Implementation Plan

> User selected rapid execution with intermediate decisions delegated. Use native execution for backend/integration and independent frontend/content workers via dispatching-parallel-agents. User instruction overrides further design approval gates.

**Goal:** A runnable two-choice Taipei interest collector with durable responses and GCP/Pages deployment tools.
**Architecture:** Static hash-routed React client, bearer-capability API, file and Firestore stores, immutable content packs.
**Tech Stack:** TypeScript, React, Vite, Express, Firestore, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-10-07-trip-helper-design.md

## Global Constraints
- Binary choices only; unanswered remains absent.
- Same immutable pack for all; place/card identity separate.
- Config/env for deployment values; no Unicode UI icons; helpers avoid duplicated business logic.
- Production credentials and private responses stay server-side.

## Review Focus
- Retrying an accepted answer after network loss cannot duplicate the event.
- Stale device changes cannot silently overwrite a newer answer.
- Revoked invitation cannot read or write after revocation.
- Published base path and fragments survive direct/reloaded Pages URLs.
- Export contains historical card context without any invitation/admin secrets.

## Task 1: Response storage and API (root)
Files: server/{config,domain,store,firestore,app,index}.ts; tests/{store,api}.test.ts.
Interfaces: shared/types.ts defines Trip, Participant, AnswerInput and Answer; POST invites returns a participant and token; GET session resolves bearer capability; PUT answers returns answer; admin stats/export/revoke use separate bearer key.
- [x] Write failing storage tests for idempotent replay, independent related cards, revision conflict, revocation, restart persistence and exports.
- [x] Run `npm test`; expected failing assertions because store behavior is missing.
- [x] Implement FileStore and domain helpers; run `npm test`, expected green.
- [x] Write HTTP authorization/malformed-input tests using real listen/fetch, verify red, implement Express routes and run suite.
- [x] Implement Firestore transactions with same domain invariants and immutable snapshot docs; document emulator/live validation status.

## Task 2: Swipe UI and researched pack (independent workers)
Files: src/**, index.html (frontend); public/trips/**, skills/trip-research/**, scripts/collect-taipei.ts (content).
Interfaces: shared/types.ts, static trips/index.json and trips/{id}.json; API contract above. Runtime source is VITE_API_BASE_URL.
- [x] Implement accessible binary swipe, review/resume queue, organizer invite/stats/export.
- [x] Research and validate real primary sources, attributed matching photos and diverse Taipei cards; all unknowns explicitly stated.
- [x] Run `npm run validate:content` and `npm run build`, expected green.

## Task 3: Deployment, integration and verification (root)
Files: scripts/{deploy-gcp,validate-content}, Dockerfile, .github/workflows/pages.yml, README.md, .env.example, tests/e2e.spec.ts, playwright.config.ts.
- [x] Add explicit project/database/origin/admin-key env deployment config and local start docs.
- [x] Run app and verify mobile/desktop invite -> answers -> restart/resume -> stats -> JSON export with Playwright.
- [x] Run npm test, npm run build and npm run validate:content, expected green.
- [x] Review authorization, persistence and queued writes in a fresh reviewer context; fix actionable issues and rerun affected checks.
- [x] Open usable local preview; report live deployment blockers accurately.

## Verification ledger
- Node24 clean npm ci succeeded; npm audit reported 0 vulnerabilities.
- 22 unit/HTTP/outbox tests pass; browser suite11 pass and1 deliberately skipped desktop-only phone viewport check.
- TypeScript/build/content validation pass;44 cards43 images34 places.
- Reviewed and fixed multi-tab queue overwrites, invitation bootstrap dependency, export reference race, card eligibility counts; regression tests reproduced failures before fixes.
- Verification-date-only refresh now preserves published snapshot; semantic changes under same version are rejected.
- Local API/frontend running; actual local trial invite opened in Codex.
- Cloud deployment unverified: explicit project ID is pending and gh credentials are invalid. No cloud resources were mutated.

## Immersive feed correction
- User confirmed Google Sheets was an initial storage idea, supplied as reference only.
- Replaced brochure-style voting layout with a full-viewport vertical snap feed and overlaid HUD/choices.
- New fullscreen/vertical-browse E2E failed before implementation, passed afterwards on both mobile and desktop.
- Full UI suite13 pass/1 intentionally skipped desktop phone-viewport case; four targeted fullscreen/drag feedback checks pass.
- 22 unit/API/outbox tests and production build pass. Larger variants of all33 official photo URLs verified by HEAD, with runtime fallback to the recorded source.

## Traditional Chinese and English
- Added shared locale types, typed UI/error dictionaries, persistent language preference and a switch on the feed, home and organizer pages.
- All44 cards have complete English presentation packs keyed by the canonical trip version. IDs, ordering and canonical content remain the same in both languages.
- Answer events record the displayed language; changing language leaves answers, progress and queued operations intact. Sessions and raw exports include matching translations.
- Research collection and publishing validation require a complete matching English pack before replacing existing output. Malformed or unavailable translations fall back to the canonical content with an explanatory message.
- Verified31 unit/API/outbox/localization tests,20 browser tests,2 intentional desktop skips for mobile-only checks, complete bilingual content validation and production build. Inspected English layout at375×667.

## Minimal mobile decision surface
- Replaced permanent trip metadata, description, category and navigation with a title, small progress indicator and two circular cross/heart controls. Details and utilities open on demand.
- Shared native dialog helper supplies focus containment, Escape and backdrop closing. Options disable background gestures and retain the visible card across language and review changes.
- New browser regression failed on the original information density, then passed on both devices. Full browser suite22 pass/2 intentional mobile-only desktop skips; final3 affected mobile checks pass including320×568 and375×667 layouts.
- 31 unit/API/outbox/localization tests, production build and bilingual content validation pass. Visually inspected the feed and options sheet; canonical content and storage are unchanged.

## Preview swipe repair
- Confirmed the reported open route lacked an invitation; preview gating disabled both horizontal gestures and answer controls. The public preview regression reproduced this failure before the fix.
- Trial routes now accept binary choices in memory only; they never create an outbox or API writes and reset on refresh. Completion and labels identify the unsaved trial clearly.
- Added actual touch input coverage through Chrome's input protocol for trial and invited routes, plus mouse/keyboard trials and complete-round checks for no persisted or transmitted trial answers.
- Full browser suite25 pass/3 intentional mobile-only desktop skips,31 unit/API/outbox/localization tests pass, production build and bilingual content validation pass.

## Gesture-only hints and text cards
- Permanent decision buttons moved into the options sheet; intent feedback remains visible only during horizontal dragging. Titles use full width and no longer share space with the details icon.
- Button selection from the sheet closes it and advances; background gestures stay blocked while dialogs are open. Feed loading now has an accessible busy state.
- Text-only experiences show the actual description on a plain background rather than generic illustration fallback.
- Both new behavior checks failed before implementation. Full browser suite30 pass/4 intentional mobile-only desktop skips; all88 bilingual titles checked at320×568.31 unit/API/outbox/localization tests, build and content validation pass.
- User explicitly requested a content subagent to replace duplicate/generic imagery with verified experience-specific material; content worker is researching independently.

## Experience-specific Taipei research
- Content worker published44 cards/23 photos/21 text-only experiences, four actual food photos and three firsthand blogs with complete English. Final version:sha256-8a31f5e69c291b63. Audit and source decisions live in docs/content-research/.
- User clarified that blogs/vlogs and deliberate repeated stimuli are welcome. Collector and validation now report repeated media without rejecting it; each card keeps its own response identity.
- Collector selects explicitly reviewed media per card, preserves actual source review dates, parses runtime schema before writes, archives prior packs and requires the complete matching English sidecar. Isolated worker checks cover draft/publication, missing translation protection, idempotent refresh and future fetch dates without fictitious source review dates.
- Actual device touch testing reproduced interception by the text-card inner scroller; explicit pan-y on that surface fixed it. Pure text also uses neutral review thumbnails.
- Final34-case browser suite30 pass/4 intentional mobile-only desktop skips;31 unit/API/outbox/localization tests pass. All88 localized titles fit320×568. Content validation and production build pass.
- Inspected the four food cards in an isolated mobile preview. Read-only checks confirmed the original local invitation returns its exact archived snapshot and matching original English; no private responses were changed.

## Purposeful text rather than missing-media fallback
- User clarified that text must itself reveal a distinctive, judgeable proposal; visually describable experiences should use suitable media.
- Re-audited21 text cards:14 received matching images,5 generic proposals were removed,2 retained positive editorial reasons about unhurried conversation and short walking with longer rest. Published39 cards/37 images/2 text-only, with complete English, as sha256-f361deb0520e73a0; previous canonical and English preserved.
- Collector now requires a positive textOnlyReason for text plans, and the research skill directs replacement/removal instead of a missing-image text quota. Worker checked idempotence, truthful dates, missing-reason rejection and schema validation.
- Native text-touch regression now uses a fixture independent of which live cards have images. Final31 unit/API/outbox/localization tests and30 browser tests pass;4 intentional desktop skips. All78 localized titles fit a narrow phone, and all37 photos loaded in an isolated mobile preview. Build and content validation pass.
