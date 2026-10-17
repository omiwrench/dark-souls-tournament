import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateMatchInput,
  MatchDetail,
  MatchSummary,
  PlayerInput,
  PlayerRecord,
  Ruleset,
  RulesetRecord,
  RulesetSummary,
  CreateTournamentInput,
  TournamentDetail,
  TournamentSummary,
} from '@dst/shared'
import { api } from './client'

export const queryKeys = {
  players: ['players'] as const,
  rulesets: ['rulesets'] as const,
  matches: ['matches'] as const,
  tournaments: ['tournaments'] as const,
}

export function usePlayers() {
  return useQuery({
    queryKey: queryKeys.players,
    queryFn: () => api<PlayerRecord[]>('GET', '/players'),
  })
}

export function useCreatePlayer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PlayerInput) => api<PlayerRecord>('POST', '/players', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.players }),
  })
}

export function useUpdatePlayer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<PlayerInput> & { id: string }) =>
      api<PlayerRecord>('PATCH', `/players/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.players })
      // Names show up in match lists too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches })
    },
  })
}

export function useDeletePlayer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/players/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.players }),
  })
}

export function useRulesets() {
  return useQuery({
    queryKey: queryKeys.rulesets,
    queryFn: () => api<RulesetSummary[]>('GET', '/rulesets'),
  })
}

export function useRuleset(id: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.rulesets, id],
    queryFn: () => api<RulesetRecord>('GET', `/rulesets/${id}`),
    enabled: id !== undefined,
  })
}

/** Creates the ruleset when it has no id yet, otherwise replaces it. */
export function useSaveRuleset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ruleset }: { id?: string; ruleset: Ruleset }) =>
      id
        ? api<RulesetRecord>('PUT', `/rulesets/${id}`, ruleset)
        : api<RulesetRecord>('POST', '/rulesets', ruleset),
    onSuccess: (record) => {
      queryClient.setQueryData([...queryKeys.rulesets, record.ruleset.id], record)
      void queryClient.invalidateQueries({ queryKey: queryKeys.rulesets, exact: true })
    },
  })
}

export function useDuplicateRuleset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<RulesetRecord>('POST', `/rulesets/${id}/duplicate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rulesets, exact: true }),
  })
}

export function useDeleteRuleset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/rulesets/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rulesets, exact: true }),
  })
}

export function useMatches() {
  return useQuery({
    queryKey: queryKeys.matches,
    queryFn: () => api<MatchSummary[]>('GET', '/matches'),
  })
}

export function useCreateMatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateMatchInput) => api<MatchDetail>('POST', '/matches', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.matches }),
  })
}

export function useDeleteMatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/matches/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.matches }),
  })
}

export function useTournaments() {
  return useQuery({
    queryKey: queryKeys.tournaments,
    queryFn: () => api<TournamentSummary[]>('GET', '/tournaments'),
  })
}

export function useTournament(id: string) {
  return useQuery({
    queryKey: [...queryKeys.tournaments, id],
    queryFn: () => api<TournamentDetail>('GET', `/tournaments/${id}`),
  })
}

export function useCreateTournament() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTournamentInput) =>
      api<TournamentDetail>('POST', '/tournaments', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.tournaments }),
  })
}

export function useDeleteTournament() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/tournaments/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tournaments })
      void queryClient.invalidateQueries({ queryKey: queryKeys.matches })
    },
  })
}

/** Creates (or fetches) the match for a bracket node. */
export function useOpenNodeMatch(tournamentId: string) {
  return useMutation({
    mutationFn: (nodeId: string) =>
      api<MatchDetail>('POST', `/tournaments/${tournamentId}/nodes/${nodeId}/match`, {}),
  })
}
