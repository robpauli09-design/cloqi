# KLOQI Supabase database

Create a Supabase project, then run the complete contents of
`migrations/202609220001_kloqi_backend.sql` in its SQL Editor as the database
owner. Apply this migration once. Alternatively use the Supabase CLI migration
workflow after linking your project. Keep `kloqi_private` out of the API's
**Exposed schemas** setting.

The application uses the publishable key plus the signed-in user's JWT.
It does **not** need a service-role key. Configure Supabase Auth's Site URL
and redirect allowlist for your local URL and eventual production domain.

## RPC contract

- `ensure_workspace(p_initial_state jsonb)` returns one row with
  `workspace_id`, `state`, `revision`. A first call creates the caller's
  workspace, owner membership and initial snapshot in one transaction.
  Repeated calls return existing data, without reseeding it. Initial revision
  is `0`; the owner uniqueness constraint serializes competing first calls.
- `save_workspace(p_workspace_id uuid, p_expected_revision integer, p_state jsonb)`
  returns the new `state` and `revision`. Members may save. A stale revision
  raises `P0001` / `revision_conflict`; fetch the latest state and reconcile
  instead of retrying the old snapshot blindly. Non-members receive
  `42501` / `workspace_forbidden`.
- `claim_ai_request()` returns a boolean and consumes one request on success.
  Limits are fixed at **20 per UTC clock minute and 200 per UTC day per user**.
  Row locking serializes claims across all server instances. This is a fixed
  window limit, not a sliding window. There is no client quota reset or refund
  endpoint. API calls that later fail still count against the limit.

Authentication is checked inside each privileged RPC. Missing authentication
raises `42501` / `authentication_required`; malformed snapshots raise
`22023` / `invalid_snapshot`. Anonymous users have neither table privileges nor
RPC execution privileges. RLS restricts authenticated reads to memberships;
direct writes to workspaces, state, memberships and quota counters are revoked.
Membership changes currently require a trusted database administrator. There
is no self-service invitation endpoint in this first backend version.

## Snapshot limits

Snapshots may contain `tasks`, `mission`, `analyzed`, `feedback`,
`notifications`, `reducedMotion` and `analysisResults`. `tasks` and `mission`
are required. Maximum encoded size: 512 KiB. Maximum counts: 1,000 tasks,
100 analyzed IDs, 500 feedback messages. Task IDs must be unique; task process
and priority values use the application's enums. Mission is an integer 0–3.
Task ID/person/due length is limited to 160 characters, titles to 300, and
descriptions/feedback to 8,000. Boolean settings remain optional.

`analysisResults` accepts at most the five known process IDs. Results require
`source: "openai"`, `model` (max 200 characters) and `text` (max 16,000).
An optional structured `analysis` accepts title (1–300 characters), recommendation
(1–8,000), 1–8 findings (1–2,000 each), and `estimatedMinutesSaved` from 0 to 1,440
or null. Unknown fields and process IDs are rejected. The overall snapshot size
limit still applies.

## Verification

Run `node --test --test-isolation=none test/supabase.test.ts` on Node 24+
from the project root (or `npx tsx --test test/supabase.test.ts` on an older
supported Node version). These tests
execute the actual migration in PGlite's PostgreSQL engine and check anonymous
denial, member/non-member isolation, direct-write denial, optimistic revision
conflicts, snapshot validation and both quota limits. Only `auth.users` and
`auth.uid()` are minimal test fixtures; PostgreSQL roles, grants, RLS and
PL/pgSQL execute normally.

PGlite is single-session: these tests verify stale-revision behavior and
quota outcomes, but do not simulate independent concurrent database sessions.
Before production, test two accounts in the actual Supabase project and run
its Security Advisor; also verify email confirmation and allowed auth
redirects. A database migration alone cannot validate hosted Auth/Data API
configuration.

References: [Supabase database functions](https://supabase.com/docs/guides/database/functions),
[Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security),
[PGlite API](https://pglite.dev/docs/api).
