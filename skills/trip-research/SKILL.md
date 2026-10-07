---
name: trip-research
description: Research and maintain shared travel experience card packs with verified media and source provenance, or analyze this app's exported binary preferences to propose a group trip. Use for travel card research and preference analysis in trip-helper.
---

Build a pack of concrete experiences that everyone can answer independently. The repository schema is the single source of truth: read [shared/types.ts](../../shared/types.ts), the content validator, and the relevant existing pack before writing content.

## Research a pack

Discuss destination, dates/year, party age range, trip style, and relevant restrictions early. Use already supplied answers; where a nonessential detail is missing, state a planning assumption and continue. Age guides variety; it must not prefilter cards or imply that all participants have the same ability or taste. Present the proposed breadth when the user has not already set it.

Choose experiences at the level people can meaningfully distinguish: looking at a building, entering a museum, buying a ticket for a view, trying a specific food, browsing shops, walking or resting. Several cards may share a stable `placeId`; interest in one must not answer another. `category` and `tags` support later analysis only. Every participant sees the same version and the same cards. Record only `interested` / `not_interested`; no answer stays unanswered.

Prefer official government, venue, park, transit, and restaurant sources. Verify current source contents and attach `checkedAt`. For Taipei use the city tourism API with `Accept: application/json`; when blocked, the configured daily Tourism Administration dataset is a primary-source fallback. This repository's reusable collector is [scripts/collect-taipei.ts](../../scripts/collect-taipei.ts), with endpoints, trip scope, and original card proposals in [taipei-config.json](../../public/trips/sources/taipei-config.json). Change config for content, rather than adding per-card code.

Use actual matching photographs with URL, descriptive alt text, original credit and source URL. A venue street scene may introduce a food proposal if identified as a street scene; it must not masquerade as a dish or a particular restaurant's interior. Keep most cards visual and use text where a matching image is unavailable. Add video only when its primary-source provenance and real playable embed/file can be verified. Keep remote media remote; verify URLs without downloading files to evade display restrictions. Record only needed metadata in the source manifest, never copied source articles.

Write concise original Traditional Chinese descriptions. State planning estimates as estimates. Do not fabricate future events, menu prices, opening hours, exhibit availability or reservations. Prefer `現場／官方公告為準` for unresolved costs. Describe known stairs, slopes, standing, crowds or conditions concretely; do not claim universal accessibility. Mark weather, seasonal displays and unpublished event schedules in `facts.seasonalNote`, or omit the uncertain experience.

The exact card fields are `id`, `placeId`, `title`, `description`, `category`, `tags`, optional `image` / `video`, `source`, and `facts`; use the linked TypeScript interfaces for nested field shapes. The pack includes `id`, `version`, `title`, `destination`, `startsOn`, `endsOn`, `audience`, `intro`, and `cards`. Keep [public/trips/index.json](../../public/trips/index.json) summaries consistent with the real pack.

## Refresh and validate

Run `node --import tsx scripts/collect-taipei.ts` from the repository root; `--config PATH` selects config. For an already verified official archive extracted locally, use `--input PATH_TO_AttractionList.json --checked-at YYYY-MM-DD`. A timestamp records an actual verification, not an assumed freshness. API source name changes intentionally fail collection so a human-readable review can resolve them.

The collector hashes scope and card meaning into `version`, excluding verification timestamps. Confirm an identical input produces identical content/version. Before changing a live pack's meaning or card IDs, inspect vote/version behavior and preserve the old version needed by existing participants; do not reinterpret old votes against edited cards. Refresh provenance dates without inventing content changes. Run `npm run validate:content`, then inspect representative cards and verify media responses. Report unresolved facts and date assumptions alongside the delivered pack.

## Analyze exported choices

Read [analysis guidance](references/analysis.md) when using raw JSON/CSV exports. Preserve direct answers and source evidence, distinguish unanswered from negative, and propose a reviewable itinerary with tradeoffs. Preference analysis is not a psychological or demographic classification.
