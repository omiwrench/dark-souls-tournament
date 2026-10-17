import { useQuery } from '@tanstack/react-query'

export type Health = { status: 'ok'; name: string; serverTime: string }

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async (): Promise<Health> => {
      const res = await fetch('/api/health')
      if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
      return res.json()
    },
    refetchInterval: 5_000,
  })
}
