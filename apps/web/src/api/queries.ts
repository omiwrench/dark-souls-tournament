import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateMatchInput,
  MatchDetail,
  MatchSummary,
  PlayerInput,
  PlayerRecord,
  RulesetSummary,
} from '@dst/shared'
import { api } from './client'

export const queryKeys = {
  players: ['players'] as const,
  rulesets: ['rulesets'] as const,
  matches: ['matches'] as const,
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

export function useRulesets() {
  return useQuery({
    queryKey: queryKeys.rulesets,
    queryFn: () => api<RulesetSummary[]>('GET', '/rulesets'),
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
