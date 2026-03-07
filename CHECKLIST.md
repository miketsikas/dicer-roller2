# Requirement Checklist

## Core stack and constraints
- [x] React + TypeScript + Vite frontend.
- [x] No custom backend/server/socket implementation in repo.
- [x] Managed realtime backend usage via Supabase client SDK.
- [x] d4/d6/d8/d10/**d12**/d20/d100 supported.
- [x] In-browser roll logic and formula evaluation.

## Shared rooms + realtime
- [x] True online room join by room code.
- [x] Deep-link support with `?room=<code>`.
- [x] Live roll propagation across room subscribers (Supabase Realtime).
- [x] Presence roster (current members) + join/leave activity events.

## Security/privacy
- [x] Anonymous/lightweight identity via Supabase Auth.
- [x] Secret roll visibility restricted to roller at DB policy level.
- [x] Public roll visibility available to same-room members.
- [x] Visibility enforcement defined through Postgres RLS (`supabase/schema.sql`).

## Local-file persistence (unchanged requirement kept)
- [x] OPFS internal JSON file primary (`client-<uuid>.json`).
- [x] IndexedDB fallback when OPFS unavailable.
- [x] Stores preferences, presets, moderation, local roll/replay cache, session replays.
- [x] 90-day cleanup on startup.
- [x] Daily cleanup timer.
- [x] Expire-on-read stale deletion.

## UX + moderation constraints
- [x] Moderation tools retained (owner mode, mute/hide aliases, local room lock).
- [x] No hard roll blocking/caps.
- [x] Spam throttling UX via duplicate burst collapse/grouping.

## History pagination (required)
- [x] Initial room history fetch is limited to 100 newest rows.
- [x] "Load more" fetches next 100 older rows.
- [x] Active feed remains newest-first.
- [x] Duplicate prevention applied while paginating + receiving realtime inserts.

## Existing feature continuity
- [x] Preset CRUD still works.
- [x] Formula parser/modifiers + adv/disadv helpers still work.
- [x] Fairness RNG mode (`crypto.getRandomValues`) still works.
- [x] Session replay/export/import still works.

## Tests included
- [x] Formula/dice logic: `src/lib/formula.test.ts`
- [x] RNG behavior: `src/lib/rng.test.ts`
- [x] 90-day cleanup: `src/storage/cleanup.test.ts`
- [x] Preset CRUD: `src/lib/presets.test.ts`
- [x] Pagination dedupe/order merge: `src/realtime/feed.test.ts`
