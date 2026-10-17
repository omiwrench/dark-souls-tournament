# Feature Spec: Dark Souls Tournament Tracker

> Status: **Draft v0.3**. A living document. Update it as decisions are made.
> Items marked **[OPEN]** still need a decision. Items marked **[LATER]** are out of scope for the first iteration but should not be designed out.

## 1. Overview

A scoreboard and tracker for a Dark Souls 1 (Remastered) tournament run with friends. Two players start fresh characters at the same time and race head-to-head, each choosing their own class, starting gift and route. A **host** watches both and records what happens: objectives completed, deaths, penalties, and the drinking-game moments around them. The app keeps score, runs the match clock, announces callouts, decides the winner, and saves the full match history for statistics afterwards.

### Physical setup (first tournament)
- 6–8 players, bracket format.
- Two TVs, one per player, each running the game.
- One laptop running this app. It serves as both the host console and the room scoreboard.

### Goals
1. **The host can track fast.** Logging an event takes one or two clicks or keypresses, and mistakes are easy to undo. This beats every other goal.
2. **Scoring is clear.** Anyone in the room can glance at the scoreboard and see who is ahead and why.
3. **Rules are flexible.** Rulesets are data, not code, so new formats can be tried without changes to the app.
4. **History is kept.** Every match is saved with a full timeline.
5. **Fun.** Dark Souls flavour and drinking-game callouts, as long as they never slow the host down.

### Non-goals
- Reading game memory or detecting events automatically. All tracking is manual.
- Video streaming or capture.
- Accounts or authentication, for now.

---

## 2. Concepts and terminology

| Term | Meaning |
|---|---|
| **Player** | A participant. Has a name and maybe an avatar or colour. |
| **Tournament** | A named event with a set of players, a bracket format, and a default ruleset. |
| **Match** | A head-to-head between two players under one ruleset. It can be part of a tournament bracket or standalone. |
| **Ruleset** | A reusable set of rules: objectives, deaths, penalties, side events, callouts, tiebreakers, and a time limit. |
| **Objective** | Something a player can achieve in-game, worth points. Example: "Defeat Quelaag". |
| **Match-ending objective** | An objective that ends the match immediately when completed. Example: "Ring a Bell of Awakening". |
| **Variant** | An optional detail the host can add to a logged event. Examples: a death "by fall damage", a Black Knight kill "with parries only". |
| **Penalty** | A host-applied sanction. It can deduct points, trigger callouts, or both. |
| **Death** | A player death. Always tracked. Whether it costs points is up to the ruleset. |
| **Side event** | Something tracked for fun that is worth no points. It can be tied to a player ("restored humanity") or to nobody in particular. |
| **Callout** | A drinking-game or fun instruction triggered by an event. Example: "{opponent} takes a shot". Shown prominently on the scoreboard. |
| **Tag** | A label on objectives, such as `boss`, used to attach one callout to many objectives. Convention: `boss` = anything with a boss health bar on screen. |
| **Event** | One timestamped entry in a match timeline. Examples: objective completed, death, penalty, side event, callout, pause. |

---

## 3. Rulesets

A ruleset contains:

- **Name** and optional **description**.
- **Time limit**. Example: 90 minutes.
- **Objectives**. Each objective has:
  - Name and optional description or hint.
  - **Points**. Positive integer.
  - **Repeatable**: either once per player or repeatable.
    - Repeatable objectives may have an optional **max count**.
  - **Category** to organise the host UI. Examples: Main route, Minibosses, NPCs.
  - Optional **tags**, such as `boss`.
  - **Match-ending** flag. A ruleset needs at least one match-ending objective or a time limit; usually it has both. Match-ending objectives are always once-only.
  - Optional **variants**. Each variant has a name, optional bonus points, and optional callouts.
  - Optional **callouts**.
- **Deaths**:
  - Points per death (0 means deaths are only counted).
  - Optional callouts on every death.
  - Optional **death variants**, each with its own callouts. Examples: fall damage, lost souls.
- **Penalties**. A list of predefined penalties, each with a name, a point deduction (0 is allowed, meaning callouts only) and optional callouts. The host can also give a custom ad-hoc penalty with a free-text reason and an optional deduction.
- **Side events**. Worth no points. Each has a name, a scope (*player*, meaning the host chooses which player did it, or *general*), and callouts.
- **Tag callouts**. Callouts that fire for any objective carrying a given tag. Example: every `boss` objective → "Everyone drinks".
- **Tiebreakers**. An ordered list, see §4.

### Callouts
A callout is an instruction shown to the room when its trigger fires:
- **Target**: the acting player, their opponent, both players, or everyone.
- **Text**, with placeholders such as `{player}` and `{opponent}`. Example: "{opponent} takes a shot".
- Optional **drinks**: a structured amount per target, so drinks can be counted in statistics. The amount is a count plus a kind:
  - `sip`, for example "drinks ×3" = 3 sips
  - `shot`
  - `finish` (finish your drink)

  Callouts without drinks, such as "praise the sun", are plain text.
- When a callout targets "everyone", only the two players are counted in the statistics. Spectators drink at their own risk.
- On a variant, a callout can either **add to** or **replace** the base event's callouts. Example: a fall-damage death says "drink ×3" instead of the normal "drink".

### Ruleset management
- Create, edit, duplicate, and delete rulesets.
- **A ruleset is copied into the match when the match starts.** Editing a ruleset later never changes the scores or history of past matches.
- [LATER] Import and export rulesets as JSON to share them.

---

## 4. Match lifecycle

```
Setup ──▶ Ready ──▶ Countdown ──▶ Live ⇄ Paused ──▶ Finished
                                              │         ▲
                                              ▼         │
                                         Tiebreaker ────┘
```

1. **Setup.** Pick two players and a ruleset. Matches created from the bracket are pre-filled. Optionally record each player's **class** and **starting gift**, for statistics.
2. **Ready.** The scoreboard shows the matchup and a summary of the ruleset.
3. **Countdown.** The host presses Start, and a 3-2-1 countdown runs on screen. Starting is always manual.
4. **Live.** The clock runs and events can be logged.
5. **Paused.** The host can pause and resume the clock. Pauses are logged in the timeline.
6. **End of play.** Play stops immediately when either:
   - **the time limit runs out**, or
   - **either player completes a match-ending objective**.

   After that, neither player can score.
7. **Winner.** The player with the most points wins. Completing a match-ending objective does not win automatically. It gives that objective's points and stops play, so a player who is behind on points can lose by ringing the bell.
8. **Tiebreaker** (only on equal points). See below.
9. **Finished.** The result is saved and the winner moves forward in the bracket.

### Tiebreakers
Each ruleset defines an **ordered list** of tiebreakers. They are checked in order, and the first one that separates the players decides the winner. Available types:

| Type | Decides by |
|---|---|
| Ended the match | The player who completed the match-ending objective |
| Fewer deaths | Lowest death count |
| Fewer penalties | Fewest penalties, or the smallest penalty total |
| First to final score | Whoever reached their final score earliest |
| **Manual / playoff** | The host picks the winner. Has an instruction text, such as "Switch to Dark Souls 3, first to kill Iudex Gundyr wins". |

- If no automatic tiebreaker decides it, the match goes into **tiebreaker mode**. A manual tiebreaker is always implied as the final fallback.
- **Tiebreaker mode UI:** the host console switches to a simple layout with the tiebreaker instruction and two big buttons, **"[Player A] wins"** and **"[Player B] wins"**, with a confirmation. The scoreboard shows the instruction prominently.
- The saved result records which tiebreaker decided the match.

### Corrections
- Any event can be **undone**, with a quick "undo last" for the most recent one, or **deleted or edited** from the timeline.
- If a match-ending event is undone, the match returns to Paused at the time it stopped.
- The host can reopen a finished match to fix mistakes. If the result changes, the bracket updates as long as later matches have not started. [LATER] Handling of results that change after later matches have started. For now this is not supported, and the host gets a warning.

---

## 5. Host console (the most important screen)

Design principles:
- **Two-column layout**, one column per player, in the same order as the physical TVs (Player 1 = left column = left TV).
- **One action, one click.** Every objective is a large button. Clicking it logs the event for that player at the current clock time.
- **Undo is always visible** and always one click away. A short, non-blocking toast confirms each action, for example "+4000 Quelaag — Player A · Undo".
- **Variants are added after the fact, not before.** Logging an event never opens a dialog. If the event has variants, the confirmation toast shows them as quick chips for a few seconds, for example `[Fall damage] [Lost souls] [>5000 souls]`. Clicking one attaches it. The host can also add variants later from the timeline.
- Once-only objectives show as **done** for that player. Repeatable objectives show their **count**, plus the max if there is one.
- Objectives are grouped by category, and there is a **quick filter or search** for long lists.
- A **death** button per player that is large and easy to hit.
- A **penalty** button per player opens the predefined penalties plus an "other" option with a reason field.
- **Side events**: player-scoped ones appear in each player's column. General ones go in a shared strip, such as "Everyone drinks".
- **Match-ending actions need a quick confirm.** That covers match-ending objectives, ending the match early, and deleting events. One extra click, not a modal maze.
- The clock, both scores, and the point difference are always visible.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `1` | Death for Player 1 |
| `2` | Death for Player 2 |
| `Ctrl+Z` (and `Cmd+Z` on Mac) | Undo last event |
| `Space` | Pause / resume |

- Shortcuts are turned off while typing in a text field.
- `Space` never *starts* a match. Starting needs the Start button, so a match can't begin by accident.
- [LATER] Shortcuts for objectives or variant chips.

---

## 6. Scoreboard and spectator view

**First iteration:** one combined screen on the laptop. The host console has scoreboard elements large enough to read from across the room: names, scores, lead, clock, and callouts.

**Planned:** a separate, read-only **spectator view** for a second display, other devices, or later remote spectators. Build the two as separate views from the start, sharing the same match state, even though v1 uses only the combined one.

Spectator view content:
- Player names, scores, and the lead, all large.
- Match clock (remaining time), with a stronger visual cue near the end, such as the last 5 minutes.
- Per player: objectives completed (with points), death count, penalties.
- A live feed of recent events.
- **Callouts**: a large, unmissable banner ("🍺 PLAYER B TAKES A SHOT"). It disappears on its own and never blocks the host. Several callouts at once queue or stack.
- Tiebreaker mode: the tiebreaker instruction, large.
- End-of-match screen: winner banner, final scores, and a summary.

---

## 7. Tournament and bracket

- Create a tournament: name, players, default ruleset, and **bracket format**:
  - Single elimination, with an optional third-place match
  - Double elimination, with an optional grand final reset (default off)
- **Byes** are added when the player count doesn't fit the bracket.
- Seeding: random or manual.
- Starting a match from the bracket fills in players and ruleset. The winner moves forward automatically.
- Bracket overview screen showing progress and results.
- Standalone matches (not part of a tournament) are also supported, for friendlies and testing rulesets.

---

## 8. History and statistics

Every match is saved with its full event timeline (including callouts) and its copy of the ruleset.

### Per match
- **Timeline view**: every event on a time axis for both players.
- **Score-over-time chart**: both players' scores plotted against match time.
- Summary: final scores, winner, how it ended (time-out or which match-ending objective), tiebreaker used if any, duration, deaths, penalties, and drinks.

### Across matches
- Match history list, filterable by tournament, player, and ruleset.
- Player stats: matches played, wins and losses, average score, deaths, drinks, classes and gifts picked, most-completed objectives.
- Objective stats per ruleset: how often each objective is completed and the average time to complete it. Useful for balancing point values.
- Drink stats: drinks taken per player (sips, shots, finishes), drinks caused to the opponent, and the thirstiest match.
- [LATER] Comparing records, such as the fastest bell or most deaths.

---

## 9. Multi-user and sync

- **First iteration:** runs on one laptop with no network dependency during the event. It must work offline.
- **Design for later:** deploy to a server so that:
  - several hosts can run matches at the same time,
  - spectators can follow live matches on their own devices,
  - several views of the same match stay in real-time sync.
- Consequence for v1: match state is **derived from an event log**, and views are **decoupled from the source of truth**. That makes a later move to server-backed sync easy. Details belong in the tech spec.
- **[LATER]** Roles: admin (rulesets, tournaments), host (tracking a match), spectator (read-only).

---

## 10. Look and feel

- Dark Souls inspired: dark stone and ember palette, serif display fonts (Optimus Princeps-like), and subtle bonfire or ember accents.
- Big moments get big treatment, only in display areas that don't block anything:
  - Match-ending objective → "VICTORY ACHIEVED" style banner.
  - Death → a brief "YOU DIED" flash in that player's area.
  - Callouts → a big themed banner.
  - Match end → winner banner.
- **The controls stay clean and functional.** Theming there is limited to colours and type. No animation may block input or move buttons around.
- [LATER] Optional sound effects, which can be muted.

---

## 11. Scope

### MVP (first tournament)
- Ruleset editor: objectives (categories, tags, repeatable/max count, match-ending, variants), deaths and death variants, penalties, side events, callouts, tiebreakers, and time limit
- Player management
- Match setup, countdown, live tracking, pause, undo/edit, end conditions, and tiebreaker mode
- Combined host console and scoreboard, with keyboard shortcuts
- Callout banners, with drink tracking
- Brackets: single elimination (optional third-place match) and double elimination
- Match history with timeline and score chart
- Local persistence, works offline
- The seed ruleset from Appendix A

### Later
- Separate spectator view on other devices, and server deployment with multiple hosts
- Roles and authentication
- Cross-match statistics and records
- Ruleset import/export
- More keyboard shortcuts
- Sound effects

---

## 12. Decisions log

| # | Decision |
|---|---|
| 1 | The UI is in English. |
| 2 | Drinks are tracked in statistics. |
| 3 | Rewriting bracket results after later matches have started is out of scope for now. |
| 4 | Point deductions for deaths and penalties are optional, and each ruleset decides. |
| 5 | `boss` tag = anything with a boss health bar on screen. |

No open questions at the moment.

---

## Appendix A: Seed ruleset "Bell Rush" (from the original draft)

**Time limit:** 90 minutes. **Match-ending:** ringing a Bell of Awakening (either bell).
**Tiebreakers:** (1) the player who rang the bell, (2) manual: "Switch to Dark Souls 3 — first to kill Iudex Gundyr wins".

### Objectives
`R` = repeatable. `boss` = has a boss health bar on screen. The minibosses here don't have one. Both Blighttown bonfire objectives can be scored by the same player.

| Category | Objective | Points | Notes |
|---|---|---:|---|
| Main route | Asylum Demon | 500 | boss |
| Main route | Taurus Demon | 1 000 | boss |
| Main route | Bell Gargoyles | 2 000 | boss |
| Main route | Capra Demon | 2 000 | boss |
| Main route | Chaos Witch Quelaag | 4 000 | boss |
| Main route | Ring a Bell of Awakening | 5 000 | **match-ending** |
| Off-route bosses | Moonlight Butterfly | 2 000 | boss |
| Off-route bosses | Stray Demon | 3 500 | boss |
| Off-route bosses | Great Grey Wolf Sif | 4 000 | boss |
| Off-route bosses | Gaping Dragon | 2 500 | boss |
| Minibosses | Havel the Rock | 1 500 | |
| Minibosses | Hydra | 2 000 | |
| Minibosses | Butcher | 500 | |
| Minibosses | Titanite Demon | 750 | |
| Minibosses | Black Knight | 250 | R. Variant: *parries only* |
| Minibosses | Hellkite Drake (bridge) | 2 000 | |
| Minibosses | Armored Tusk ("Stålgrisen") | 350 | |
| Explore & find | Blighttown bonfire — front way | 1 000 | |
| Explore & find | Blighttown bonfire — back way | 500 | |
| Explore & find | Firekeeper Soul | 250 | R |
| Explore & find | Grass Crest Shield | 250 | |
| NPCs | Meet Solaire | 250 | |
| NPCs | Meet Siegmeyer | 500 | |
| NPCs | Rescue Lautrec | 500 | |
| NPCs | Kill Lautrec (come on…) | 500 | |
| NPCs | Kill Lautrec (for real) | 750 | |
| NPCs | Rescue Griggs | 500 | |
| NPCs | Rescue Laurentius | 500 | |
| NPCs | Kill Crestfallen Warrior | 250 | |
| Rares & RNG | Balder Side Sword | 1 000 | |
| Rares & RNG | Black Knight weapon | 1 000 | R |
| Rares & RNG | Drake Sword | 750 | |
| Rares & RNG | Scythe | 500 | |
| Rares & RNG | Gargoyle Tail Axe | 500 | |
| Speedrun nerd strats | Sen's Fortress gate skip | 500 | |
| Speedrun nerd strats | Sen's Fortress top bonfire | 2 000 | |
| Speedrun nerd strats | Iron Golem | 5 000 | boss |
| Speedrun nerd strats | Ornstein & Smough | 15 000 | boss |
| Speedrun nerd strats | Look at the boobs (with binoculars!) | 20 000 | |
| Speedrun nerd strats | Gwyn | 1 000 000 | boss |

### Deaths
- Points per death: 0. In this ruleset deaths are for drinking only.
- Every death → **{player} drinks** (1 sip).
- Variants (more than one can apply):
  - *Fall damage* → **{player} drinks ×3** (3 sips, replaces the base callout)
  - *Lost souls* (died again before recovering the bloodstain) → **{player} takes a shot** (added to the base callout)
  - *Died holding >5 000 souls* → **{player} drinks ×3** (3 sips, added to the base callout)

### Tag and objective callouts
- Any `boss` objective → **Everyone drinks**
- Ring a Bell of Awakening → **Everyone finishes their drink**
- Black Knight, *parries only* variant → **{opponent} takes a shot**

### Penalties
None defined. The host can still give ad-hoc penalties.

### Side events
| Side event | Scope | Callout |
|---|---|---|
| Restored humanity | player | **{opponent} drinks** |
| Summoned Solaire | player | **Both players drop their controllers and praise the sun together** \\[T]/ |
