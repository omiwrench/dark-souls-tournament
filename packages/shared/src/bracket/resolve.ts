import type { PlayerSlot } from '../match/events'
import type { Bracket, BracketNode, Source } from './generate'

/** Who is (or will be) in a slot. */
export type Entrant =
  | { kind: 'player'; playerId: string }
  | { kind: 'bye' }
  /** Depends on a match that hasn't been decided yet. */
  | { kind: 'pending' }

/** What we need to know about a bracket node's match, if it has one. */
export type NodeMatch = {
  matchId: string
  finished: boolean
  winner: PlayerSlot | null
}

export type NodeState =
  /** Waiting for earlier matches. */
  | 'waiting'
  /** Both players known; the match can be started. */
  | 'ready'
  /** A match exists and isn't finished. */
  | 'playing'
  | 'done'
  /** One side is a bye; the other player advances without playing. */
  | 'walkover'
  /** Not needed, e.g. a grand final reset when the winners-bracket player won. */
  | 'skipped'

export type ResolvedNode = {
  node: BracketNode
  entrants: [Entrant, Entrant]
  state: NodeState
  winner: Entrant
  loser: Entrant
  match?: NodeMatch
}

export type ResolvedBracket = {
  nodes: Map<string, ResolvedNode>
  /** Set once the tournament is decided. */
  champion: string | null
  /** Final placements that are known: 1st, 2nd, 3rd (3rd may be shared). */
  placements: { place: number; playerIds: string[] }[]
}

const PENDING: Entrant = { kind: 'pending' }
const BYE: Entrant = { kind: 'bye' }

/**
 * Works out every node from the structure, the seeding (player ids, best seed first)
 * and the results of the matches played so far.
 */
export function resolveBracket(
  bracket: Bracket,
  seeding: readonly string[],
  matches: ReadonlyMap<string, NodeMatch>,
): ResolvedBracket {
  const byId = new Map(bracket.nodes.map((n) => [n.id, n]))
  const resolved = new Map<string, ResolvedNode>()

  const entrant = (source: Source): Entrant => {
    if (source.kind === 'seed') {
      const playerId = seeding[source.seed - 1]
      return playerId ? { kind: 'player', playerId } : BYE
    }
    const from = resolve(byId.get(source.nodeId)!)
    return source.kind === 'winnerOf' ? from.winner : from.loser
  }

  const resolve = (node: BracketNode): ResolvedNode => {
    const cached = resolved.get(node.id)
    if (cached) return cached
    const entrants: [Entrant, Entrant] = [entrant(node.slots[0]), entrant(node.slots[1])]
    const match = matches.get(node.id)
    const result = decide(node, entrants, match)
    const value: ResolvedNode = { node, entrants, match, ...result }
    resolved.set(node.id, value)
    return value
  }

  const decide = (
    node: BracketNode,
    [a, b]: [Entrant, Entrant],
    match: NodeMatch | undefined,
  ): Pick<ResolvedNode, 'state' | 'winner' | 'loser'> => {
    // The reset is only played when the losers-bracket player won the grand final.
    if (node.side === 'reset') {
      const grandFinal = resolve(byId.get('GF')!)
      if (grandFinal.state !== 'done') return { state: 'waiting', winner: PENDING, loser: PENDING }
      if (grandFinal.match?.winner === 1)
        return { state: 'skipped', winner: PENDING, loser: PENDING }
    }
    if (a.kind === 'bye' && b.kind === 'bye') return { state: 'walkover', winner: BYE, loser: BYE }
    if (a.kind === 'bye' && b.kind === 'player') return { state: 'walkover', winner: b, loser: BYE }
    if (b.kind === 'bye' && a.kind === 'player') return { state: 'walkover', winner: a, loser: BYE }
    if (a.kind !== 'player' || b.kind !== 'player') {
      return { state: 'waiting', winner: PENDING, loser: PENDING }
    }
    if (!match) return { state: 'ready', winner: PENDING, loser: PENDING }
    if (!match.finished || !match.winner)
      return { state: 'playing', winner: PENDING, loser: PENDING }
    return match.winner === 1
      ? { state: 'done', winner: a, loser: b }
      : { state: 'done', winner: b, loser: a }
  }

  for (const node of bracket.nodes) resolve(node)
  return { nodes: resolved, ...standings(bracket, resolved) }
}

function standings(bracket: Bracket, nodes: Map<string, ResolvedNode>) {
  const playerOf = (e: Entrant | undefined) => (e?.kind === 'player' ? e.playerId : null)
  const placements: ResolvedBracket['placements'] = []
  const place = (placeNumber: number, ...entrants: (Entrant | undefined)[]) => {
    const playerIds = entrants.map(playerOf).filter((id): id is string => id !== null)
    if (playerIds.length) placements.push({ place: placeNumber, playerIds })
  }

  // The deciding node is the last one that was actually needed.
  let final: ResolvedNode | undefined
  if (bracket.format.kind === 'single') {
    final = nodes.get(`W${Math.log2(bracket.size)}-1`)
  } else {
    // While the reset may still be needed it is `waiting`, so nothing is decided yet.
    const reset = nodes.get('GF2')
    final = reset && reset.state !== 'skipped' ? reset : nodes.get('GF')
  }
  const decided = final && (final.state === 'done' || final.state === 'walkover')
  const champion = decided ? playerOf(final!.winner) : null
  if (decided) place(1, final!.winner)
  if (decided) place(2, final!.loser)

  if (bracket.format.kind === 'single') {
    const third = nodes.get('3P')
    if (third && (third.state === 'done' || third.state === 'walkover')) {
      place(3, third.winner)
    } else if (!third && bracket.size >= 4) {
      // Without a third-place match, both semifinal losers share third.
      const rounds = Math.log2(bracket.size)
      const semis = [nodes.get(`W${rounds - 1}-1`), nodes.get(`W${rounds - 1}-2`)]
      if (semis.every((s) => s?.state === 'done' || s?.state === 'walkover')) {
        place(3, ...semis.map((s) => s!.loser))
      }
    }
  } else {
    const losersFinal = [...nodes.values()].find(
      (n) => n.node.side === 'losers' && n.node.round === 2 * (Math.log2(bracket.size) - 1),
    )
    if (losersFinal?.state === 'done' || losersFinal?.state === 'walkover') {
      place(3, losersFinal.loser)
    }
  }
  return { champion, placements }
}

/** Nodes whose players, or whether they're played at all, depend on `nodeId`'s result. */
export function dependentsOf(bracket: Bracket, nodeId: string): BracketNode[] {
  return bracket.nodes.filter(
    (n) =>
      n.slots.some((slot) => slot.kind !== 'seed' && slot.nodeId === nodeId) ||
      (n.side === 'reset' && nodeId === 'GF'),
  )
}
