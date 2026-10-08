# Personal presentation and launch implementation plan

**Goal:** Give each new invitation a permanent, varied card order, save raw browsing separately from binary choices, resume across devices, then publish on GitHub Pages with Cloud Run/Firestore in the user-selected project.

**Approved design:** The user approved the in-chat design on 2026-10-09 and authorized production deployment. New invitations shuffle with recent place/tag/category penalties and category pacing. Every card remains present exactly once; repeated experiences remain independent. Existing invitations without presentation metadata retain canonical order. Translations never affect identity/order. No preference-based recommendations.

**Architecture:** Store the ordered IDs on each participant. Immutable visit operations form a predecessor chain; cursor updates compare predecessor IDs atomically, so delayed operations retain research value without rewinding a newer device. Answers and views remain independent. Per-operation browser storage reuses the outbox implementation; visits retry offline and use one session UUID per open page.

**Targets:** GCP `deemo-reborn-90033034`; GitHub public `Farl/trip-helper`; Pages origin `https://farl.github.io`. A dedicated runtime account, service, secret and collection prefix isolate the application. Region is selected after checking existing Firestore; choose asia-east1 if creating a new database.

## Tasks

- [x] Pure ordering (`shared/presentation.ts`, `tests/presentation.test.ts`): prove deterministic full permutation, different participants, feasible sibling spacing, early/late category coverage, language-independent application and legacy fallback.
- [x] Durable backend (`shared/types.ts`, domain/store/firestore/app, store/API tests): prove restart persistence, immutable order, visit replay and payload collision protection, stale predecessor protection, scope/version/revocation checks, visits never vote, complete export references.
- [x] Browser flow (`src/outbox.ts`, `src/useFeedActivity.ts`, `src/useAnswers.ts`, `src/Feed.tsx`, API/i18n): initialize participant order after session load; restore server cursor on fresh device and unsent local cursor on same device; save visible settled cards only; queue independently; stop tracking utility panels; preserve old local position until server cursor exists.
- [x] Verify mobile/desktop: full shuffled round, canonical raw answers, reload/new-browser resume, language stability, offline visits replay, paused sessions and old-order compatibility. Run unit suite/content/build/full browser suite; independent security/code review before publishing.
- [x] Production: inspect billing/database/service state, provision dedicated resources, deploy tested source, set Pages workflow and API variable, publish reviewed commit, smoke real Firestore/session/CORS/order/cursor/export and real public browser route. No sample responses become family answers; remove/revoke smoke invitations.

## Review focus

1. Older offline visit chain must never regain cursor ownership after another device branches.
2. Session retries, translations and React StrictMode must not unexpectedly restore/reorder a running feed.
3. Failed visits must not delete pending answers or report all data saved.
4. Existing store JSON and invitation snapshots must load without migration of order or answers.
5. Production bundles/source uploads must exclude local invite tokens, responses, admin keys and test artifacts.

## Progress

- Plan and targets recorded; backend and pure ordering delegated with disjoint ownership. Frontend and deployment remain with root.

- Verification: 56 unit/API tests pass; content validator and production build pass. Fresh general/security reviews completed; all three important edge cases reproduced by failing tests then fixed (quota exhaustion, cached progress, unsettled views). Full browser regression: 42 passed, 4 desktop skips (mobile-only cases).
- Ruling: cursor updates use predecessor IDs rather than client timestamps, avoiding clock skew and allowing stale offline visits to remain auditable without reclaiming cursor ownership.
- Ruling: preserve same-device offline acknowledged progress in session metadata using monotonic revisions; actual raw visit recordedAt remains server receive time, documented explicitly.
- Ruling: only stable cards after a configurable 200ms interval become passive visits; an explicit binary choice establishes immediate exposure. Browser test requires real settled transitions when asserting visibility.
- Ruling: continue in the existing project checkout per the user's ongoing authorized iteration; do not create an unrelated worktree or move the preview.

- Production complete 2026-10-09: app commit6241650, Cloud Run revision trip-helper-00001-stm, dedicated runtime/build accounts, Standard Native Firestore asia-east1 with delete protection and payload index exemption. Pages workflow37811668011 passed build+deploy.
- Public site https://farl.github.io/trip-helper/; API https://trip-helper-244200756201.asia-east1.run.app. Actual production checks passed auth/CORS, complete204card orders, immutable visits/answers, stale cursor protection, raw exports; fresh mobile Chrome passed public real video, invited voting, new-device resume, English order stability and organizer statistics.
- Own deployment smoke documents removed using explicit participant IDs; no family responses existed locally and no local invite/store/admin files were uploaded. Organizer secret remains in Secret Manager and an ignored mode0600 local file.
