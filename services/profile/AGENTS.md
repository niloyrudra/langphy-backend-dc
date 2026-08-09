# AGENTS.md — Profile Service

> Loaded read-only into every aider session for this service
> (via .aider.conf.yml `read:`). Keep it under ~150 lines — it's sent on
> every single request to the model.

## Service Identity
- **Name**: @langphy/profile
- **Language/Runtime**: node-typescript
- **Role in system**: handles user profile CRUD (create/read/update/delete)
  and consumes `user.registered.v1` / `user.deleted.v1` events to keep
  `lp_profiles` in sync with the auth service.
- **Depends on**: auth service (source of truth for users), Kafka message
  queue, PostgreSQL database (`lp_profiles`, `deleted_users`, `event_inbox`)
- **Consumed by**: mobile client (via gateway), other services that need
  profile data

## Build & Test Commands
```
Type check : npx tsc --noEmit
Unit tests : npx jest
E2E tests  : npm run test:e2e
Lint       : npx eslint .
```

## Directory Conventions
- `src/` — application code
- `tests/unit/` — unit tests (mirror src/ structure,
  e.g. src/models/profile.model.ts → tests/unit/models/profile.model.test.ts)
- `tests/helpers/` — test utilities (e.g. `mock-pg.ts` for fake Postgres pool)
- `src/db/migrations/` — SQL schema migrations
- `src/config/` — startup env validation
- `src/errors/` — CustomError subclasses
- `src/kafka/` — producer/consumer wiring
- `src/middlewares/` — express middleware (requireAuth, errorHandler)
- `src/models/` — pure data-access classes (no transactions)
- `src/repos/` — transaction-aware repositories

## Coding Standards
- Prefer `async/await` over `.then()` chains
- Use `import type { ... }` for type-only imports
- SQL is parameterized — never concatenate user input
- All DB access goes through `pgPool` from `src/db/index.ts`
- Event handlers are idempotent + transactional (BEGIN/COMMIT/ROLLBACK)
- Errors are CustomError subclasses; errorHandler routes them to JSON

## NLP-Specific Notes (only for spacy/faster-whisper services)
- Not applicable — this is a REST/Postgres/Kafka service

## Rules for AI Agents Working on This Service

1. **Never change a function's signature or return type** without explicit
   permission for that specific change. If a fix seems to require it,
   stop and report why instead of doing it.
2. **Scope edits tightly.** When told to fix a specific snippet, touch only
   that snippet — not neighboring lines, not unrelated formatting.
3. **Every fix needs a test.** If no unit test covers the code path being
   changed, write one first (with a one-line comment explaining why it's
   needed), then implement the fix.
4. **Never commit automatically.** All changes stay uncommitted until a
   human explicitly approves and commits them.
5. **Report severity honestly.** Use:
   - 🔴 Critical — exploitable security issue, data loss risk, crash in prod path
   - 🟡 Warning — performance issue, fragile error handling, missing validation
   - 🔵 Info — style/convention deviation, minor improvement opportunity

## Do Not Touch
- `src/db/migrations/*.sql` (append-only; never edit existing migrations)
<!-- - `src/db/index.ts` (shared by all routes; changes affect every endpoint)
- `src/kafka/consumer.ts` (event-processing pipeline; changes risk
  breaking idempotency or data sync with auth service)
- `tests/helpers/mock-pg.ts` (test harness; changes may break all tests)
- `package-lock.json` (regenerate only via `npm install`; never hand-edit) -->
