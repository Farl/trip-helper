# Publication evidence for visual preference decks

Read this before selecting media or deciding a broad trip is sufficiently explored.
These are research acceptance gates, not changes to the traveler interface.

## Research breadth before drafting

Create a scope-specific matrix whose rows are recognizable preference differences,
not only category labels. Record region, dimension, candidate venues/experiences,
accepted card IDs, rejected candidates and reasons, unsearched candidates and next
search. Distinguish an **unexplored preference** from an **operational uncertainty**.
Unknown snow, tickets, queues or future opening hours do not describe research breadth.

For an open-ended multi-day, multi-region trip, the initial landmarks are a seed,
not the finished questionnaire. Plan a substantial exploration range appropriate to
the destinations and the user's requested breadth; record that range and rationale.
Trip length measures available travel time, not the number of alternatives worth
showing. A large opportunity set is not an itinerary to complete. If the user has
rejected a small deck, expanding only a few cards does not resolve their request.
Compare the types and variety of earlier requested decks, rather than silently
switching to a shortlist. Do not derive a universal card quota from one trip.

Useful dimensions to consider include:

| Domain | Independently distinguishable preferences |
|---|---|
| Food | Fish/raw seafood, meat/grilling, fried dishes, noodles, vegetables, casual versus seated courses, baked versus cold sweets, bitter tea versus sweet drinks, coffee |
| Shopping | Ceramics/tableware, textiles/clothes, paper/stationery, crafts/incense, design objects, books/music, vintage/collectibles, useful kitchen goods |
| Play | Make an object, learn a food/craft technique, interactive exhibit, art, history, science, animals, performance, indoor leisure |
| Sights | Gardens, buildings/interiors, viewpoints, water/mountain scenery, neighborhood atmosphere, night streets, seasonal displays |

Adapt the matrix to the actual destinations; exclude incompatible or unavailable
experiences with evidence. Search beyond the main tourism catalog, including venue
and merchant originals, dated firsthand blogs and actual vlog frames. Populate each
high-value dimension with several distinct candidates where the destination supports
them. A repeated dish at one venue is not coverage of a missing cuisine or activity.

**Stopping evidence:** the planned exploration range has been addressed; the matrix
has no unexplored high-value row; accepted candidates show meaningful variety across
the destinations and domains; each genuine residual gap lists candidates searched
and the reason they failed. More cards can be rejected for quality, but that reopens
the search for the missing preference rather than shrinking the deck silently.
Report a clearly labeled incomplete draft if that evidence is not yet available.

Keep intentionally repeated stimuli when the user wants independent reactions, with
separate card IDs and a media-review rationale. They can coexist with variety; they
do not count as research into an unrelated missing preference. Preserve this
distinction when deciding what to remove, rather than maximizing unique-place count.

## Select and measure the exact original

Use the largest relevant native image exposed by the source's original-file link,
srcset, CSS background, gallery/intrinsic media metadata or documented image service.
If the first HTML image is a small thumbnail or unrelated header, inspect the public
gallery and CSS before concluding that suitable originals do not exist. Record the actual source evidence.
Removing a declared downsize parameter can recover an original; requesting a larger
resize of a tiny file cannot. HTTP 200, a large file name, an agency credit or an
alt-text match establishes neither resolution nor representativeness.

Use the configurable [media policy](media-policy.json). Its baseline requires a
1200-pixel long edge, 800-pixel short edge and enough retained native pixels for the
420×746 portrait card. A trip-specific policy can demand more. Do not lower a policy
to rescue rejected thumbnails. Upscaling and sharpening cannot manufacture detail.

For every selected still, record:

| Field | Required evidence |
|---|---|
| Identity | Card ID, selected URL, original asset identity, actual image-source page and credit |
| Object identity | Match the visible food, product or exhibit to the source's named item and adjacent caption/product description; a brand homepage alone does not prove which item it is |
| Native pixels | Decoded width/height, source of the full-size asset, confirmation it is not upscaled |
| Original subject | What travelers would do and which visible object/action explains its appeal |
| Visible subject | What remains in the actual centered portrait crop; dish/product/action remains recognizable |
| Clarity | Focus/detail checked at displayed size, not just the full-size file or a small contact-sheet tile |
| Time/season | Visit/filming date versus publication date, or explicitly unknown; relevant seasonal mismatch |
| Decision | Accepted/replaced/rejected and specific reason, plus browser-load result |

When seasonal conditions are the visual appeal (flowers, autumn foliage, ground
snow, seasonal dishes or festival lights), use verified media and operation evidence
appropriate to the travel season. A caveat hidden in details does not make an
unavailable seasonal experience representative. Unknown capture date is acceptable
for a season-insensitive object or action, with the uncertainty recorded; it is not
evidence of December snow, foliage or event operation. Keep year-end holiday crowds
separate from an ordinary mid-December weekday, and do not transfer one visitor's
quiet/crowded scene into a queue prediction.

Use Pillow with an available Python runtime to run:

```sh
python skills/trip-research/scripts/review_media.py --pack DRAFT.json --input REVIEW.json --output AUDIT.json --contact-sheet /tmp/review-crops.jpg
```

The script binds every selected still to the actual draft, rejects missing or
wrong-URL reviews, measures native pixels and reproduces the centered cover crop. Its input
is an array containing `cardId`, `path` (temporary inspected original), `url`,
`selectedUrl`, `representative`, `cropRepresentative`, `sharpnessReviewed`,
`notUpscaled`, `inspection`, `sourceEvidence` and `seasonEvidence`. Set editorial
booleans only after inspecting that exact original and crop. A script pass does not
perform the visual judgment for you. Contact sheets locate issues; inspect ambiguous
or detailed subjects individually at card size. Inspection derivatives remain
temporary and do not become published media without reuse authorization.

## Inspect the traveler view before publishing

Inspect **every** still in the real card crop, including title overlays; verify loads
separately. Check every video in the active card and its real preview interval.
Food needs the specific food; products need products; workshops need action or
finished work; an entrance/sign/empty interior is not the promised experience.
The original being attractive is insufficient if the portrait crop loses its subject.
Prefer a better original whose subject survives the existing layout. Keep a card
only after both pixel and editorial gates pass; low resolution noted in an audit is
still rejected media, not an approved exception.

If a filename, caption, ingredient list or page section contradicts the visual
interpretation, hold the card and resolve that conflict with the actual source.
For example, a yellow chocolate filling must not be called citrus until the
product description confirms it. Changing the core food or activity requires a
new card ID; keep correction history in the audit, not traveller-facing copy.

When media fails, seek another accurate original or verified source video for that
same experience, then research alternative candidates for that preference dimension.
Do not use unrelated pictures, generated assets, weak text fallbacks or duplicates
to recover a numeric target. Do not mark a broad deck complete while major dimensions
disappear because their first images were poor.

Publish only the reviewed draft plus matching English sidecar and per-card media
audit. Preserve old canonical/English versions for existing invitations. Schema,
build and HTTP checks are necessary but cannot establish editorial quality or breadth.
