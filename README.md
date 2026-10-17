# 🔥 Dark Souls Tournament Tracker

> _Ahh, hello. You don't look like the Hollow sort. That's good._
> _Then you are here to compete. Head-to-head. For points. And for drinks._

A scoreboard and tracker for running **head-to-head Dark Souls tournaments** with friends. Two Chosen Undead start fresh characters at the same time. A host watches over them like a slightly drunk Firekeeper. Points are earned for bosses, exploration, NPCs and general swag, and every death, lost bloodstain and parry-only Black Knight kill can trigger a round of drinks.

The first player to ring a Bell of Awakening ends the round. **That doesn't make them the winner.** The player with the most points wins, so rushing the bell while behind is a great way to lose.

```
Amazing tournament ahead
Try rushing, but hole
Be wary of Lautrec
Praise the Sun! \[T]/
```

---

## ⚔️ Features (planned)

- **Host console built for speed.** One click per event, `1`/`2` to log a death, `Space` to pause, `Ctrl+Z` to undo. The host has a drink in one hand.
- **Configurable rulesets.** Objectives with points, repeatable or once-only, match-ending objectives, time limits, penalties, and ordered tiebreakers.
- **Callouts.** Drinking-game rules attached to objectives, deaths, penalties and side events. _"Player B takes a shot."_ _"Everyone finishes their drink."_ _"Both players drop their controllers and praise the sun."_
- **Variants.** "Died to fall damage", "died with >5 000 souls", "Black Knight killed with parries only", added after the fact so the host never slows down.
- **Brackets.** Single elimination (optional third-place match) or double elimination (optional grand final reset), with byes for awkward player counts.
- **History and statistics.** Full match timelines, score-over-time charts, objective completion rates, and the all-important drink leaderboard.
- **Live sync.** Every screen subscribes to the same event stream. One laptop today, spectators everywhere tomorrow.
- **Dark Souls vibes.** YOU DIED. VICTORY ACHIEVED. Optimus Princeps. Embers.

## 🕯️ Status

**Bonfire lit.** Matches, rulesets and full tournaments with brackets work. Next up: match history and statistics.

| Milestone                                | Status |
| ---------------------------------------- | ------ |
| Feature & tech specs                     | ✅     |
| M0: Scaffold                             | ✅     |
| M1: Domain core (rules, events, scoring) | ✅     |
| M2: Server                               | ✅     |
| M3: Playable match                       | ✅     |
| M4: Editors                              | ✅     |
| M5: Tournaments & brackets               | ✅     |
| M6: History & stats                      | ⏳     |
| M7: Polish & theming                     |        |
| M8: Deploy to Cloud Run                  |        |

## 📜 Docs

- [Feature spec](docs/feature-spec.md): _what_ we're building, including the default "Bell Rush" ruleset.
- [Tech spec](docs/tech-spec.md): _how_ we're building it, plus a glossary for web development newcomers.

## 🛡️ Stack

TypeScript all the way down: **React** + **Vite** on the front, **Node** + **Fastify** + WebSockets on the back, **SQLite** + **Drizzle** for storage, all in one Docker image. Planned hosting is **Google Cloud Run**, with **Litestream** backing up to Cloud Storage.

Under the hood, every match is an append-only **event log**. Scores, timelines, callouts and drink stats are all calculated from it, which is how undo works.

## 🗡️ Getting started

Requires **Node.js 24+** (see `.nvmrc`).

```bash
npm install
npm run dev        # server on :3000 + web on http://localhost:5173
```

| Command                           | What it does                                                         |
| --------------------------------- | -------------------------------------------------------------------- |
| `npm run dev`                     | Runs the server (auto-restart) and the web app (hot reload) together |
| `npm test`                        | Runs all tests                                                       |
| `npm run typecheck`               | Type-checks every workspace                                          |
| `npm run lint` / `npm run format` | ESLint / Prettier                                                    |
| `npm run build` then `npm start`  | Production build, served by the server on http://localhost:3000      |

Repo layout: `apps/web` (React), `apps/server` (Fastify), `packages/shared` (rules and scoring shared by both). See the [tech spec](docs/tech-spec.md) for details.

## 🍺 House rules (excerpt from "Bell Rush")

| You…                                 | Then…                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Die                                  | You drink                                                               |
| Die to fall damage                   | You drink ×3                                                            |
| Lose your souls                      | You take a shot                                                         |
| Restore humanity                     | Your opponent drinks                                                    |
| Kill a boss                          | Everyone drinks                                                         |
| Ring the bell                        | Everyone finishes their drink                                           |
| Look at the boobs (with binoculars!) | +20 000 points. You know which ones.                                    |
| Kill Gwyn                            | +1 000 000 points, and an explanation of how you did that in 90 minutes |

Please drink responsibly. Hollowing is permanent.

## ⚖️ Disclaimer

A non-commercial fan project made for fun among friends. Not affiliated with or endorsed by FromSoftware or Bandai Namco. _Dark Souls_ is a trademark of its respective owners.
