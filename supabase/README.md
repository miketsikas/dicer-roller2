# Supabase Setup

1. Create a Supabase project.
2. In `Authentication -> Providers`, enable Anonymous sign-ins.
3. Run `supabase/schema.sql` in the SQL editor.
4. Copy project values to `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Start app with `npm run dev`.

Security behavior:
- Public rolls: selectable by members in same room.
- Secret rolls: selectable only by the roller (`roller_id = auth.uid()`).
- Policies are enforced in Postgres RLS (not only UI).
