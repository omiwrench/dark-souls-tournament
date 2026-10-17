# Tech Spec: Dark Souls Tournament Tracker

> Status: **Draft v0.4**. A living document. Update it as the implementation evolves.
> Companion to [`feature-spec.md`](./feature-spec.md). It covers _how_ we build what that document describes.
> New to web development? See the [Glossary](#glossary) at the bottom.

## 1. Stack at a glance

| Layer                | Choice                                                  | Why                                                                                 |
| -------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Language             | **TypeScript** everywhere                               | One language, with domain types and scoring logic shared between browser and server |
| Frontend             | **React** + **Vite**                                    | Industry-standard UI library, with a fast dev server and build tool                 |
| Routing (frontend)   | **React Router**                                        | Maps URLs to screens                                                                |
| Server data fetching | **TanStack Query**                                      | Caches REST responses, with loading and error states                                |
| Backend              | **Node.js 24 LTS** + **Fastify**                        | Small, fast HTTP server with a good WebSocket plugin (`@fastify/websocket`)         |
| Validation           | **Zod**                                                 | One schema gives both runtime validation and TypeScript types                       |
| Database             | **SQLite** via **better-sqlite3** + **Drizzle ORM**     | One database file, zero setup, typed queries, and a migration path to Postgres      |
| Charts               | **Recharts**                                            | Simple React charts, used for score over time                                       |
| Styling              | **CSS Modules** + CSS custom properties (design tokens) | Plain CSS you can learn from, with styles scoped per component                      |
| Tests                | **Vitest**                                              | Fast unit tests, especially for the scoring reducer                                 |
| Monorepo             | **npm workspaces**                                      | No extra tools needed                                                               |
| Packaging            | **Docker** (one image)                                  | The same artifact runs locally and on Cloud Run                                     |
| Hosting (later)      | **Google Cloud Run** + **Litestream** → Cloud Storage   | Managed containers, with the SQLite file continuously backed up                     |

---

## 2. Architecture

```
┌──────────────────────────── Browser ────────────────────────────┐
│  React app (apps/web)                                           │
│   ├─ Host console / combined view ──┐                           │
│   ├─ Spectator view                 ├─ live match store         │
│   └─ Editors, bracket, stats        │  (events → reducer → state)
│          │ REST (HTTP/JSON)         │ WebSocket (pushed events) │
└──────────┼──────────────────────────┼───────────────────────────┘
           ▼                          ▲
┌──────────────────────── Node server (apps/server) ──────────────┐
│  Fastify                                                        │
│   ├─ REST routes: players, rulesets, tournaments, matches, stats│
│   ├─ Command handler: validate → append events → broadcast      │
│   ├─ Match clock service (time-limit timers)                    │
│   └─ WebSocket hub (topic subscriptions)                        │
│          │                                                      │
│   packages/shared: types, Zod schemas, reducer, bracket logic   │
│          ▼                                                      │
│   SQLite file (data/tournament.db)                              │
└─────────────────────────────────────────────────────────────────┘
```

Principles:

1. **The server is the source of truth.** Clients send _commands_, and the server turns them into _events_.
2. **Match state = `reduce(events)`.** The same pure function runs on the server (to validate commands and compute results) and in the browser (to render). Scores are never stored as editable numbers.
3. **All views are just subscribers.** The host console, the combined view, a spectator screen across the room, and a phone on another continent all use the same mechanism. Going from one laptop to many devices is a deployment change, not a rewrite.
4. **Fully offline in v1.** No CDN fonts or scripts at runtime. Everything is bundled.

---

## 3. Repository layout

```
dark-souls-tournament/
├─ apps/
│  ├─ web/                 # React frontend (Vite)
│  │  └─ src/
│  │     ├─ routes/        # one folder per screen
│  │     ├─ components/    # reusable UI pieces
│  │     ├─ live/          # WebSocket client + live match store
│  │     ├─ api/           # REST client + TanStack Query hooks
│  │     ├─ theme/         # tokens.css, fonts, global styles
│  │     └─ main.tsx
│  └─ server/              # Fastify backend
│     └─ src/
│        ├─ routes/        # REST endpoints
│        ├─ ws/            # WebSocket hub
│        ├─ db/            # Drizzle schema, migrations, repositories
│        ├─ services/      # match commands, clock, stats
│        └─ index.ts
├─ packages/
│  └─ shared/              # used by both apps
│     └─ src/
│        ├─ ruleset/       # Ruleset types + Zod schemas
│        ├─ match/         # events, commands, reducer, decide(), clock math
│        ├─ bracket/       # bracket generation + resolution
│        ├─ stats/         # stat aggregations
│        └─ seed/          # "Bell Rush" seed ruleset
├─ docs/                   # feature-spec.md, tech-spec.md
├─ data/                   # local SQLite file (git-ignored)
├─ Dockerfile
├─ litestream.yml
└─ package.json            # npm workspaces root
```

---

## 4. Domain model (`packages/shared`)

All types are defined as **Zod schemas**, and the TypeScript types are inferred from them. The shapes below are simplified.

### 4.1 Ruleset

```ts
type Ruleset = {
  id: string
  name: string
  description?: string
  timeLimitMs: number | null // null = no time limit
  categories: { id: string; name: string }[]
  objectives: Objective[]
  deaths: { deduction: number; callouts: Callout[]; variants: Variant[] }
  penalties: Penalty[]
  sideEvents: SideEvent[]
  tagCallouts: { tag: string; callouts: Callout[] }[]
  tiebreakers: Tiebreaker[] // ordered; a manual fallback is always implied
}

type Objective = {
  id: string
  name: string
  description?: string
  categoryId: string
  points: number
  tags: string[] // e.g. ["boss"]
  repeat: { kind: 'once' } | { kind: 'repeatable'; max?: number }
  endsMatch: boolean // implies repeat.kind === "once"
  variants: Variant[]
  callouts: Callout[]
}

type Variant = {
  id: string
  name: string
  bonusPoints: number // usually 0
  callouts: Callout[]
  calloutMode: 'add' | 'replace' // replace = suppress the base event's own callouts
}

type Penalty = {
  id: string
  name: string
  deduction: number // ≥ 0; 0 = callouts only
  callouts: Callout[]
}
type SideEvent = { id: string; name: string; scope: 'player' | 'general'; callouts: Callout[] }

type Callout = {
  target: 'actor' | 'opponent' | 'players' | 'everyone'
  text: string // supports {player} and {opponent}
  drinks?: { kind: 'sip' | 'shot' | 'finish'; amount: number }
}

type Tiebreaker =
  | { kind: 'endedMatch' }
  | { kind: 'fewerDeaths' }
  | { kind: 'fewerPenalties' }
  | { kind: 'firstToFinalScore' }
  | { kind: 'manual'; instruction: string }
```

Notes:

- IDs inside a ruleset (objectives, variants, and so on) are stable short strings, so events can refer to them. The editor generates them.
- **A replace-mode variant only suppresses callouts attached to the event itself** (objective or death callouts). Tag callouts, such as "boss → everyone drinks", always fire.
- **Drinks in stats:** `players` counts for both players. `everyone` counts for both players only, since spectators aren't tracked.
- Validation rules that the schema can't express go in `validateRuleset()`. Examples: there must be at least one end condition, `endsMatch` objectives must be once-only, IDs must be unique, general side events can't target `actor`/`opponent`, and nothing may follow a `manual` tiebreaker.
- `fewerPenalties` compares the _number_ of penalties, not the points deducted.

### 4.2 Match events (stored, append-only)

The types in this section are summaries. The Zod schemas in `packages/shared/src` are the source of truth.

```ts
type MatchEvent = {
  seq: number // 1, 2, 3… per match; gap-free
  at: string // server wall-clock time (ISO)
  matchTimeMs: number // match clock when it happened (editable via amendment)
  body: EventBody
}

type PlayerSlot = 1 | 2

type EventBody =
  | { type: 'match.started'; countdownMs: number } // clock starts at `at + countdownMs`
  | { type: 'clock.paused' }
  | { type: 'clock.resumed' }
  | { type: 'objective.completed'; player: PlayerSlot; objectiveId: string; variantIds: string[] }
  | { type: 'death'; player: PlayerSlot; variantIds: string[] }
  | { type: 'penalty'; player: PlayerSlot; penaltyId?: string; reason?: string; deduction: number }
  | { type: 'sideEvent'; player?: PlayerSlot; sideEventId: string }
  | { type: 'match.timeExpired' }
  | { type: 'match.endedByHost'; reason?: string }
  | { type: 'tiebreaker.resolved'; winner: PlayerSlot }
  // corrections: never delete rows, append a correction instead
  | { type: 'event.voided'; targetSeq: number }
  | {
      type: 'event.amended'
      targetSeq: number
      changes: { variantIds?: string[]; matchTimeMs?: number; player?: PlayerSlot }
    }
```

**Why append-only, even for undo?** Every client only has to apply "new events since seq N", so syncing stays trivial. The timeline keeps an honest audit trail of corrections. Replays are deterministic.

### 4.3 Commands (what clients send)

Commands express _intent_. The server's `decide(state, command, now)` either rejects a command with a reason or turns it into events. Examples:

```ts
type Command =
  | { type: 'start'; countdownMs?: number }
  | { type: 'pause' }
  | { type: 'resume' }
  // Logging commands take an optional `matchTimeMs` for backdating ("that was two minutes ago").
  | { type: 'completeObjective'; player: PlayerSlot; objectiveId: string; variantIds?: string[] }
  | { type: 'logDeath'; player: PlayerSlot; variantIds?: string[] }
  | {
      type: 'givePenalty'
      player: PlayerSlot
      penaltyId?: string
      reason?: string // required for ad-hoc penalties
      deduction?: number // ad-hoc only; predefined penalties use the ruleset's value
    }
  | { type: 'logSideEvent'; player?: PlayerSlot; sideEventId: string }
  | { type: 'setVariants'; targetSeq: number; variantIds: string[] }
  | { type: 'undo'; targetSeq: number } // client says *which* event, so two hosts can't undo the wrong one
  | { type: 'amend'; targetSeq: number; changes: { matchTimeMs?: number; player?: PlayerSlot } }
  | { type: 'endMatch'; reason?: string }
  | { type: 'resolveTiebreaker'; winner: PlayerSlot }
```

Examples of rejections: a once-only objective already completed, the max count reached, the match not live, an unknown ID, or undoing an event that is already voided.

Timing rules for logging commands:

- Rejected before the start and during the countdown.
- Rejected once the time limit is reached. The server first appends any due expiry via `checkExpiry(state, now)`.
- A backdated `matchTimeMs` can't be in the future.
- **After the end**, only backdated events from strictly before the end are accepted. This lets the host add something they forgot to log, without reopening the match.

### 4.4 Derived match state (the reducer)

```ts
function reduceMatch(snapshot: Ruleset, events: MatchEvent[]): MatchState
```

It works in two passes:

1. **Resolve corrections.** Apply `event.voided` and `event.amended` to get the _effective_ event list, sorted by `matchTimeMs` and then by `seq`.
2. **Fold.** Walk the effective events to compute:

```ts
type MatchState = {
  status: 'ready' | 'live' | 'paused' | 'tiebreaker' | 'finished'
  clock: {
    startsAt?: string
    runningSince?: string
    elapsedBeforeMs: number
    limitMs: number | null
  }
  players: [PlayerState, PlayerState]
  timeline: TimelineEntry[] // effective events + points delta + derived callouts
  callouts: DerivedCallout[] // { sourceSeq, target, resolvedText, drinks, forPlayers }
  end?: { reason: 'timeLimit' | 'objective' | 'host'; matchTimeMs: number; byPlayer?: PlayerSlot }
  result?: { winner: PlayerSlot; decidedBy: 'points' | Tiebreaker['kind'] }
  pendingTiebreaker?: { instruction?: string }
}

type PlayerState = {
  score: number
  objectiveCounts: Record<string, number>
  deaths: number
  penalties: { seq: number; points: number; label: string }[]
  drinks: { sip: number; shot: number; finish: number }
  scoreHistory: { matchTimeMs: number; score: number }[] // for the chart + "first to final score"
}
```

Key rules in the reducer:

- **Callouts are derived, not stored.** If a variant is added to an event afterwards, its callouts appear when the state is recomputed. Drink stats come for free.
- **End of play:** the first effective `objective.completed` with `endsMatch`, `match.timeExpired`, or `match.endedByHost`. Effective events after the end are ignored. The server rejects new ones anyway.
- **Result:** compare scores. On a tie, run the ruleset's tiebreakers in order. If none decides, or a `manual` tiebreaker is reached, the status becomes `tiebreaker` until `tiebreaker.resolved` arrives.
- **Undoing the match-ending objective** removes the end, and the status becomes `paused` at the time it was logged. The host resumes manually. (In the reducer, logging a match-ending objective always pauses the clock, and the end freezes it.)
- **Robust against bad sequences:** if an amendment creates an impossible state, such as a once-only objective completed twice after moving an event to the other player, the extra event is kept in the timeline as `ignored` with a reason instead of being scored. The same applies to unknown IDs and events after the end.

**Countdown** isn't a stored status. Any client computes "counting down" as `now < clock.startsAt`. Since `match.started` carries the countdown length, every screen shows the same 3-2-1.

### 4.5 Clock

- The server never ticks. The clock state is a set of timestamps: `startsAt`, the pause/resume events, and `elapsedBeforeMs`.
- `matchTime(clock, now)` is one shared function. The server uses it to stamp events. The browser uses it to render the clock at 60 fps with `requestAnimationFrame`.
- **Server time offset:** when the WebSocket connects, the server sends `serverNow`, and the client computes `offset = serverNow - Date.now()`. That's not needed on one laptop, but required for remote spectators.
- **Time limit:** the clock service on the server keeps one timer per live match, rescheduled on pause and resume. When it fires, it appends `match.timeExpired`. When the server starts, it checks live matches and appends expiries that are overdue (for example after a crash or restart).
- **Logging while paused is allowed.** The event is stamped with the paused match time, which is useful when the host pauses first and logs second.

---

## 5. Brackets (`packages/shared/bracket`)

- **Stored:** the bracket _structure_, generated once when the tournament is created. It's a list of nodes:

  ```ts
  type BracketNode = {
    id: string
    round: number
    side: 'winners' | 'losers' | 'final' | 'thirdPlace'
    slots: [Source, Source]
    matchId?: string
  }
  type Source =
    | { kind: 'seed'; seed: number }
    | { kind: 'winnerOf' | 'loserOf'; nodeId: string }
    | { kind: 'bye' }
  ```

- **Derived:** who is actually in each slot, computed from the structure plus the match results. A corrected result therefore updates the bracket automatically. If a downstream match has already started, the server refuses to change the result, and the host sees a warning (per the feature spec).
- **Generation:**
  - Pad to the next power of two with byes.
  - Use standard seeding order (1 vs N, 2 vs N-1, …) so byes go to the top seeds.
  - Seeding is random or manual.
  - Single elimination can have an optional third-place node. Double elimination builds a winners bracket, a losers bracket and a grand final. A **grand final reset** is optional: if enabled and the losers-bracket player wins the first grand final, a deciding match node is played. The default is no reset.
- A bracket match is created as a row in `matches` when the host opens it, with players and a ruleset snapshot filled in.

---

## 6. Database (SQLite + Drizzle)

| Table              | Columns (main)                                                                                                                                                                                                    | Notes                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `players`          | `id`, `name`, `color`, `created_at`                                                                                                                                                                               |                                                                                          |
| `rulesets`         | `id`, `name`, `definition` (JSON), `updated_at`                                                                                                                                                                   | The full `Ruleset` document, validated with Zod when read and written                    |
| `tournaments` (M5) | `id`, `name`, `format` (JSON), `default_ruleset_id`, `seeding` (JSON), `bracket` (JSON), `created_at`                                                                                                             |                                                                                          |
| `matches`          | `id`, `tournament_id?`, `bracket_node_id?`, `player1_id`, `player2_id`, `player_setup` (JSON: class, gift), `ruleset_snapshot` (JSON), `status`, `winner_slot?`, `score1`, `score2`, `created_at`, `finished_at?` | The `status`/score columns are a **cache** for list views, rewritten after every command |
| `match_events`     | `match_id`, `seq`, `at`, `match_time_ms`, `body` (JSON)                                                                                                                                                           | Primary key `(match_id, seq)`. Append-only.                                              |

- **Why store rulesets as JSON documents?** A ruleset is a nested tree (objectives → variants → callouts) that is always read and written as a whole. Splitting it into 6 tables would add a lot of code for no benefit at this scale.
- **Transactions:** a command is handled in one synchronous SQLite transaction: load events → `decide` → insert events → update the cached columns. Node runs our code on one thread and better-sqlite3 is synchronous, so commands for a match can never interleave.
- **Migrations:** `drizzle-kit generate` creates SQL migration files. The server applies pending migrations when it starts.
- **Seeding:** on first start, if there are no rulesets, insert "Bell Rush" from `packages/shared/src/seed`.
- **Backup in v1:** the database is one file, `data/tournament.db`. There's an "Export all data (JSON)" button in settings.

---

## 7. API

### 7.1 REST (JSON over HTTP, under `/api`)

| Method & path                                                                        | Purpose                                                                                                                        |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET/POST /players`, `PATCH/DELETE /players/:id`                                     | Player CRUD                                                                                                                    |
| `GET/POST /rulesets`, `GET/PUT/DELETE /rulesets/:id`, `POST /rulesets/:id/duplicate` | Ruleset CRUD                                                                                                                   |
| `GET/POST /tournaments`, `GET /tournaments/:id`                                      | Tournaments, with the resolved bracket                                                                                         |
| `POST /tournaments/:id/nodes/:nodeId/match`                                          | Create or open the match for a bracket node                                                                                    |
| `GET/POST /matches`, `GET/DELETE /matches/:id`                                       | List (`?status=live,paused&tournamentId=…`), create, read and delete matches. `GET` returns the ruleset snapshot + all events. |
| `POST /matches/:id/commands`                                                         | Send a command. Returns `200 { events }` or `409 { error }`.                                                                   |
| `GET /stats/players`, `GET /stats/rulesets/:id`, `GET /stats/drinks`                 | Aggregated statistics                                                                                                          |
| `GET /export`                                                                        | Full JSON export                                                                                                               |

Commands use REST instead of the WebSocket because a request/response pair gives the host a clear success or error for each click. The WebSocket is only for pushing updates out.

Errors always have the shape `{ error: { code, message, issues? } }`:

- `400 invalid_request`: the body failed Zod validation, and `issues` lists each problem.
- `400 invalid_ruleset`: the ruleset failed `validateRuleset`, with `issues`.
- `404 not_found`.
- `409` with the `decide()` error code, e.g. `limit_reached` or `match_ended`, when a command is rejected. `409 in_use` when deleting a player who has matches.

Each command runs in one SQLite transaction: load events → append any due expiry → `decide` → append → update the cached columns. Broadcasting happens after the commit, and the expiry timer for the match is rescheduled.

### 7.2 WebSocket (`/ws`)

```ts
// client → server
{ type: "subscribe";   topic: "match"; id: string; sinceSeq?: number }
{ type: "subscribe";   topic: "matches" }                          // the match list
{ type: "unsubscribe"; topic: "match"; id: string }
{ type: "unsubscribe"; topic: "matches" }

// server → client
{ type: "hello"; serverNow: number }                               // epoch ms
{ type: "match.events"; matchId: string; events: MatchEvent[] }   // in seq order
{ type: "matches.changed" }      // a match was created/deleted or its status/score changed; refetch
{ type: "error"; code: string; message: string }
// [M5] { type: "tournament.changed"; tournamentId: string }
```

- **Catch-up:** on (re)connect, the client subscribes with the last `seq` it has, and the server sends everything after it. This handles reconnects, Cloud Run's connection time limit, and laptops waking from sleep.
- If a client notices a gap in `seq`, it refetches the whole match.
- The hub keeps subscriptions in memory, which works because there is one server process.
- Subscribing and catching up happen in one synchronous step, so no event can be missed in between.
- The message schemas live in `packages/shared/src/api`, shared by server and web.

---

## 8. Frontend (`apps/web`)

### 8.1 Routes

| Path                                   | Screen                                                        |
| -------------------------------------- | ------------------------------------------------------------- |
| `/`                                    | Home: live and recent matches, tournaments, quick "New match" |
| `/players`                             | Player management                                             |
| `/rulesets`, `/rulesets/:id`           | Ruleset list and editor                                       |
| `/tournaments/new`, `/tournaments/:id` | Tournament creation and bracket view                          |
| `/matches/new`                         | Standalone match setup                                        |
| `/matches/:id/host`                    | **Host console** (the combined view in v1)                    |
| `/matches/:id/view`                    | Spectator view, read-only, built in v1 but optional to use    |
| `/matches/:id`                         | Match summary: timeline and score chart                       |
| `/stats`                               | Statistics                                                    |

### 8.2 Live match store

- `useLiveMatch(matchId)` loads the match via REST, subscribes over the WebSocket, appends incoming events, and memoises `reduceMatch(snapshot, events)`.
- Host actions call `POST /commands`. The UI updates when the resulting events come back over the WebSocket, which takes milliseconds locally.
- **[LATER]** If remote hosting feels sluggish, the UI can update optimistically: apply `decide` locally and reconcile when the server's events arrive.
- **New callouts** (by `sourceSeq` not seen before in this session) are put in a banner queue. Callouts that already existed when the page loaded don't re-trigger.

### 8.3 Host console specifics

- **Layout:**
  - Header: clock, scores, lead, and the pause/start buttons.
  - Two player columns, with deaths, penalties, side events, and objectives grouped by category.
  - A shared strip with general side events and the event feed (with undo and edit).
  - Callout banners overlay the scoreboard area only, never the buttons.
- **Keyboard:** one `keydown` listener on `window` while the host route is open.
  - It ignores events whose target is an `input`, `textarea`, `select` or `contenteditable` element.
  - `1`/`2` log a death. `Space` pauses or resumes. `Ctrl+Z`/`Cmd+Z` undoes the latest undoable event.
  - It calls `preventDefault()` on Space, so the page doesn't scroll or "click" the focused button. Buttons also blur after a mouse click for the same reason.
- **Undoable events:** objectives, deaths, penalties, side events, variant changes, match-ending by host, and tiebreaker resolution. Pause, resume and start are not on the undo stack.
- **Variant chips** live in the confirmation toast for about 6 s. Clicking one sends `setVariants`.
- **Tiebreaker mode:** when `status === "tiebreaker"`, the console renders only the instruction and two large winner buttons, with a confirm step.

### 8.4 Theming

- Design tokens are CSS custom properties in `theme/tokens.css`: colours, spacing and type scale.
- Dark-first palette: stone greys, ember orange accents, and parchment text. Player 1 and Player 2 each get a colour token.
- **Fonts are self-hosted** (bundled with the app, no Google Fonts at runtime): **Optimus Princeps** (free font) for headings and banners, plus a highly legible sans-serif for controls. Ship the font's licence/readme file next to it in the repo.
- Animations ("YOU DIED", "VICTORY ACHIEVED", callouts) use CSS only. They are `pointer-events: none` and positioned so they never cover controls. They respect `prefers-reduced-motion`.

---

## 9. Statistics

- Computed on the server by replaying the events of finished matches through the shared reducer. With dozens of matches this takes milliseconds, so there's no stats cache in v1.
- Per player: matches, wins and losses, average score, deaths, drinks taken and drinks caused (callouts targeting the opponent), and classes and gifts picked.
- Per ruleset objective: completion rate and average/fastest `matchTimeMs`.
- Per match: score-over-time series (from `scoreHistory`) and the timeline.

---

## 10. Development workflow

```bash
npm install          # installs all workspaces
npm run dev          # runs Vite (web) + tsx watch (server) together
npm test             # Vitest across workspaces
npm run build        # builds shared, web (static files) and server
npm start            # production server, serving the built web app
```

- In dev, Vite runs on `:5173` and proxies `/api` and `/ws` to the Fastify server on `:3000`.
- In production, Fastify serves the built frontend from `apps/web/dist`, so everything is on one port.
- The server binds to `127.0.0.1` by default. Setting `HOST=0.0.0.0` lets phones on the same Wi-Fi open the spectator view, a free bonus before cloud deployment.
- **Formatting and lint:** Prettier + ESLint, with defaults kept minimal.

### Testing strategy

- **Reducer and `decide()`:** thorough unit tests. This is where the game rules live, and it's pure functions, which are easy to test. Cases: once-only vs repeatable and max count, ending objectives, time expiry, undo of the ending objective, variants with replace/add, tag callouts, each tiebreaker, and logging while paused.
- **Bracket generation:** tests for 2–16 players, byes, third place, and double elimination.
- **Server:** a few API tests using Fastify's built-in `inject` (no real network) against a temporary SQLite file.
- **Host console render tests:** the console is rendered to HTML (React server rendering, no browser needed) for each match state, using the shared test harness (`@dst/shared/testing`). These catch crashes and missing content, not layout or interaction.
- [LATER] Playwright end-to-end tests for the host console.

---

## 11. Deployment (later: Cloud Run)

**Container:** a multi-stage `Dockerfile`. One stage builds everything, and a slim Node runtime stage holds the built app plus the `litestream` binary.

**Startup (entrypoint):**

1. `litestream restore -if-replica-exists data/tournament.db`, which pulls the latest copy from Cloud Storage.
2. `litestream replicate -exec "node apps/server/dist/index.js"`, which runs the app while continuously replicating changes.

**Cloud Run settings:**

- `--max-instances=1`. One writer for SQLite, and the in-memory WebSocket hub stays correct.
- `--min-instances=0` normally, and `1` on tournament day to avoid cold starts.
- **CPU always allocated** (instance-based billing), so Litestream can replicate in the background between requests.
- `--timeout=3600` for long-lived WebSockets. Clients auto-reconnect and catch up via `sinceSeq`.
- A service account with write access to one Cloud Storage bucket.

**Known risk:** during a deploy, Cloud Run briefly runs old and new revisions at the same time, which means two writers to the replica. Mitigation: deploy only when no match is live. That's acceptable for a hobby app.

**Auth:** none in v1, since it runs locally. Before deploying publicly, add at least a shared host password for write routes, with spectators read-only. Roles come later (see the feature spec, §9).

**Escape hatch:** if we ever need more than one instance, switch Drizzle to Postgres (Cloud SQL, or Neon/Supabase) and the WebSocket hub to a pub/sub system. The domain code doesn't change.

---

## 12. Milestones

| #   | Milestone          | Done when                                                                                                                                                                                                                |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M0  | Scaffold           | Monorepo, `npm run dev` shows a page talking to the server, CI-free lint and tests run                                                                                                                                   |
| M1  | Domain core        | Ruleset schema, events, `decide`, reducer, clock math, and the "Bell Rush" seed. Heavily unit-tested.                                                                                                                    |
| M2  | Server             | DB schema and migrations, REST, command handling, WebSocket hub, clock service                                                                                                                                           |
| M3  | **Playable match** | Create a standalone match (two players, seed ruleset) and run it end to end in the host console: shortcuts, undo, variants, callout banners, tiebreaker mode. _A test evening with friends could be held at this point._ |
| M4  | Editors            | Player management and the ruleset editor                                                                                                                                                                                 |
| M5  | Tournaments        | Bracket generation (single/double elimination, third place), bracket view, auto-advancement                                                                                                                              |
| M6  | History and stats  | Match summary with timeline and chart, stats page including drinks                                                                                                                                                       |
| M7  | Polish             | Dark Souls theming, banners and animations, spectator view, JSON export                                                                                                                                                  |
| M8  | Deploy             | Dockerfile, Litestream, Cloud Run                                                                                                                                                                                        |

---

## 13. Decisions log

| #   | Decision                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------- |
| 1   | Double elimination: a grand final reset is an option when creating the tournament, defaulting to no reset. |
| 2   | Display font: Optimus Princeps (free), self-hosted.                                                        |

No open questions at the moment.

---

## Glossary

| Term                         | Meaning                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API**                      | The set of URLs the frontend calls to talk to the backend.                                                                                                       |
| **REST**                     | A convention for APIs: resources at URLs (`/players/42`) manipulated with HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).                                |
| **WebSocket**                | A long-lived two-way connection between browser and server, used here so the server can push new events instantly.                                               |
| **Event sourcing**           | Storing _what happened_ (events) instead of _the current state_. The state is computed by replaying events. This gives undo, timelines and sync almost for free. |
| **Command vs event**         | A command is a request ("log a death for P1") that can be rejected. An event is a fact that has been accepted ("P1 died at 12:34").                              |
| **Reducer**                  | A pure function `(state, event) → newState`. Folding it over all events gives the current state.                                                                 |
| **Pure function**            | Its output depends only on its input, with no side effects. Easy to test and safe to run anywhere.                                                               |
| **Monorepo / workspaces**    | Several packages (web, server, shared) in one repository, linked by npm so they can import each other.                                                           |
| **Vite**                     | A dev server and bundler. It serves your code instantly while developing, and bundles it into static files for production.                                       |
| **Bundle**                   | The optimised JS/CSS files the browser downloads.                                                                                                                |
| **ORM** (Drizzle)            | A library that maps database tables to typed code, so you write `db.select().from(players)` instead of raw SQL strings (raw SQL is still available).             |
| **Migration**                | A versioned script that changes the database schema, such as adding a column, applied in order.                                                                  |
| **Zod schema**               | A runtime description of a data shape. It validates untrusted input (API requests, JSON from the DB) and also generates the TypeScript type.                     |
| **CSS Modules**              | CSS files whose class names are scoped to one component, so styles don't leak.                                                                                   |
| **Design tokens**            | Named design values (colours, spacing) defined once as CSS variables and used everywhere.                                                                        |
| **Container / Docker image** | The app plus its runtime, packaged as one portable unit.                                                                                                         |
| **Cloud Run**                | Google's managed service that runs containers. It scales up and down (to zero) with no servers to maintain.                                                      |
| **Cold start**               | The delay when Cloud Run has to start a container because none is running.                                                                                       |
| **Litestream**               | A tool that continuously copies a SQLite database to cloud storage and restores it on startup.                                                                   |
| **Optimistic update**        | Updating the UI immediately, before the server confirms, then reconciling.                                                                                       |
| **CDN**                      | A network that serves static files such as fonts and libraries. We avoid relying on one at runtime so the app works offline.                                     |
