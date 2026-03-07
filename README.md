# Dice Workspace Roller (Frontend + Managed Realtime)

A React + TypeScript + Vite tabletop dice roller.

- No custom backend server is implemented in this repo.
- Shared online rooms use managed services directly from the frontend via **Supabase**.
- Local client data still persists in browser-internal file storage (OPFS first, IndexedDB fallback).

## Features
- Player alias + room display name inputs
- Dice counts: d4, d6, d8, d10, **d12**, d20, d100
- Secret roll toggle
- Roll, Reset, Undo
- Quick actions: public 1d20, secret 1d20, random batch
- Formula parser: `2d20kh1+5`, `4d6kh3`, `1d20+7`, advantage/disadvantage helpers
- Saved presets with CRUD + apply
- Background carousel + manual background picker
- Moderation tools: owner mode, room lock, mute/hide aliases, spam-burst collapsing (no hard roll caps)
- Session replay snapshots, JSON import/export, CSV export
- Shareable deep links with `?room=<code>`

## Shared Rooms (Supabase)
- Anonymous/lightweight auth via Supabase Auth
- Realtime room feed with presence (join/leave + who is online)
- Public rolls visible to room members
- Secret rolls visible only to the roller
- Security enforced by Postgres RLS policies (`supabase/schema.sql`)

## Roll History Pagination
- Initial room fetch loads newest **100** rolls
- "Load more" fetches next **100** older rolls
- Newest-first ordering is preserved
- Duplicate entries are deduplicated when combining realtime + pagination

## Local Storage Model
Primary local persistence: OPFS JSON file `client-<uuid>.json`.

Stored locally:
- preferences
- named dice presets
- local roll/replay cache
- moderation settings
- session replays

Fallback: IndexedDB with same JSON payload shape.

## Cleanup Lifecycle (90 days)
- Startup cleanup: removes stale `client-*.json` files older than 90 days.
- Daily cleanup: runs every 24h while app stays open.
- Expire-on-read: stale files are deleted immediately if encountered while loading.

## Project Structure
- `src/App.tsx`: main orchestration
- `src/components/*`: UI blocks
- `src/lib/*`: pure dice/formula/RNG/preset/export logic
- `src/realtime/*`: Supabase realtime/auth room services + pagination merge helpers
- `src/storage/*`: OPFS + IndexedDB fallback + stale-file cleanup
- `supabase/schema.sql`: DB schema + RLS + realtime publication setup

## Setup
1. Install deps:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill Supabase values.
3. Apply SQL in `supabase/schema.sql`.
4. Run app:
   ```bash
   npm run dev
   ```

## Tests
```bash
npm run test:run
npm run build
```

Coverage includes:
- formula/dice logic
- RNG behavior
- 90-day cleanup behavior
- preset CRUD
- realtime feed dedupe/order merge logic
