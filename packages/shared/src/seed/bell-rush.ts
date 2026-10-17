import { type Callout, type RulesetInput, RulesetSchema } from '../ruleset/schema'

type ObjectiveInput = RulesetInput['objectives'][number]

const objective = (
  categoryId: string,
  id: string,
  name: string,
  points: number,
  extra: Partial<ObjectiveInput> = {},
): ObjectiveInput => ({ categoryId, id, name, points, ...extra })

const boss = { tags: ['boss'] }
const repeatable = { repeat: { kind: 'repeatable' } } as const

const drinks = (target: Callout['target'], text: string, amount = 1): Callout => ({
  target,
  text,
  drinks: { kind: 'sip', amount },
})
const shot = (target: Callout['target'], text: string): Callout => ({
  target,
  text,
  drinks: { kind: 'shot', amount: 1 },
})

/** The ruleset from the original tournament draft. See feature spec, Appendix A. */
export const bellRush = RulesetSchema.parse({
  id: 'bell-rush',
  name: 'Bell Rush',
  description:
    'Race to ring a Bell of Awakening, or score more before your opponent does. 90 minutes.',
  timeLimitMs: 90 * 60_000,
  categories: [
    { id: 'main-route', name: 'Main route' },
    { id: 'off-route-bosses', name: 'Off-route bosses' },
    { id: 'minibosses', name: 'Minibosses' },
    { id: 'explore', name: 'Explore & find' },
    { id: 'npcs', name: 'NPCs' },
    { id: 'rares', name: 'Rares & RNG' },
    { id: 'speedrun', name: 'Speedrun nerd strats' },
  ],
  objectives: [
    objective('main-route', 'asylum-demon', 'Asylum Demon', 500, boss),
    objective('main-route', 'taurus-demon', 'Taurus Demon', 1_000, boss),
    objective('main-route', 'bell-gargoyles', 'Bell Gargoyles', 2_000, boss),
    objective('main-route', 'capra-demon', 'Capra Demon', 2_000, boss),
    objective('main-route', 'quelaag', 'Chaos Witch Quelaag', 4_000, boss),
    objective('main-route', 'bell-of-awakening', 'Ring a Bell of Awakening', 5_000, {
      endsMatch: true,
      callouts: [
        {
          target: 'everyone',
          text: 'Everyone finishes their drink',
          drinks: { kind: 'finish', amount: 1 },
        },
      ],
    }),

    objective('off-route-bosses', 'moonlight-butterfly', 'Moonlight Butterfly', 2_000, boss),
    objective('off-route-bosses', 'stray-demon', 'Stray Demon', 3_500, boss),
    objective('off-route-bosses', 'sif', 'Great Grey Wolf Sif', 4_000, boss),
    objective('off-route-bosses', 'gaping-dragon', 'Gaping Dragon', 2_500, boss),

    objective('minibosses', 'havel', 'Havel the Rock', 1_500),
    objective('minibosses', 'hydra', 'Hydra', 2_000),
    objective('minibosses', 'butcher', 'Butcher', 500),
    objective('minibosses', 'titanite-demon', 'Titanite Demon', 750),
    objective('minibosses', 'black-knight', 'Black Knight', 250, {
      ...repeatable,
      variants: [
        {
          id: 'parries-only',
          name: 'Parries only',
          callouts: [shot('opponent', '{opponent} takes a shot')],
        },
      ],
    }),
    objective('minibosses', 'hellkite-drake', 'Hellkite Drake (bridge)', 2_000),
    objective('minibosses', 'armored-tusk', 'Armored Tusk ("Stålgrisen")', 350),

    objective('explore', 'blighttown-front', 'Blighttown bonfire — front way', 1_000),
    objective('explore', 'blighttown-back', 'Blighttown bonfire — back way', 500),
    objective('explore', 'firekeeper-soul', 'Firekeeper Soul', 250, repeatable),
    objective('explore', 'grass-crest-shield', 'Grass Crest Shield', 250),

    objective('npcs', 'meet-solaire', 'Meet Solaire', 250),
    objective('npcs', 'meet-siegmeyer', 'Meet Siegmeyer', 500),
    objective('npcs', 'rescue-lautrec', 'Rescue Lautrec', 500),
    objective('npcs', 'kill-lautrec-shackled', 'Kill Lautrec (come on…)', 500),
    objective('npcs', 'kill-lautrec', 'Kill Lautrec (for real)', 750),
    objective('npcs', 'rescue-griggs', 'Rescue Griggs', 500),
    objective('npcs', 'rescue-laurentius', 'Rescue Laurentius', 500),
    objective('npcs', 'kill-crestfallen', 'Kill Crestfallen Warrior', 250),

    objective('rares', 'balder-side-sword', 'Balder Side Sword', 1_000),
    objective('rares', 'black-knight-weapon', 'Black Knight weapon', 1_000, repeatable),
    objective('rares', 'drake-sword', 'Drake Sword', 750),
    objective('rares', 'scythe', 'Scythe', 500),
    objective('rares', 'gargoyle-tail-axe', 'Gargoyle Tail Axe', 500),

    objective('speedrun', 'sens-gate-skip', "Sen's Fortress gate skip", 500),
    objective('speedrun', 'sens-top-bonfire', "Sen's Fortress top bonfire", 2_000),
    objective('speedrun', 'iron-golem', 'Iron Golem', 5_000, boss),
    objective('speedrun', 'ornstein-smough', 'Ornstein & Smough', 15_000, boss),
    objective('speedrun', 'binoculars', 'Look at the boobs (with binoculars!)', 20_000),
    objective('speedrun', 'gwyn', 'Gwyn', 1_000_000, boss),
  ],
  deaths: {
    deduction: 0,
    callouts: [drinks('actor', '{player} drinks')],
    variants: [
      {
        id: 'fall-damage',
        name: 'Fall damage',
        calloutMode: 'replace',
        callouts: [drinks('actor', '{player} drinks ×3', 3)],
      },
      {
        id: 'lost-souls',
        name: 'Lost souls',
        callouts: [shot('actor', '{player} takes a shot')],
      },
      {
        id: 'rich-death',
        name: 'Died holding >5 000 souls',
        callouts: [drinks('actor', '{player} drinks ×3', 3)],
      },
    ],
  },
  penalties: [],
  sideEvents: [
    {
      id: 'restored-humanity',
      name: 'Restored humanity',
      scope: 'player',
      callouts: [drinks('opponent', '{opponent} drinks')],
    },
    {
      id: 'summoned-solaire',
      name: 'Summoned Solaire',
      scope: 'player',
      callouts: [
        {
          target: 'players',
          text: 'Both players drop their controllers and praise the sun together \\[T]/',
        },
      ],
    },
  ],
  tagCallouts: [{ tag: 'boss', callouts: [drinks('everyone', 'Everyone drinks')] }],
  tiebreakers: [
    { kind: 'endedMatch' },
    { kind: 'manual', instruction: 'Switch to Dark Souls 3 — first to kill Iudex Gundyr wins' },
  ],
} satisfies RulesetInput)
