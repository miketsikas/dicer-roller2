# Implementation Notes

- Shared rooms are implemented with Supabase Auth + Postgres + Realtime directly from the React app.
- No Node/Express/socket backend is added in this repository.
- Secret roll privacy is enforced by Postgres RLS (`room_rolls_select_visible`) instead of UI-only filtering.
- Room presence uses Realtime Presence with join/leave event rendering.
- History pagination is 100-row page based (`created_at` cursor) with dedupe merge to avoid duplicates.
- Local OPFS/IndexedDB storage remains authoritative for preferences, presets, moderation, and replay cache.
- 90-day cleanup now includes startup sweep, daily timer, and expire-on-read handling.
