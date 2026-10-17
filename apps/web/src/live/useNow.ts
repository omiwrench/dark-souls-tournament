import { useEffect, useState } from 'react'
import { liveSocket } from './socket'

/** The server's current time, re-rendering every `intervalMs`. Keep it in small components. */
export function useServerNow(intervalMs = 250) {
  const [now, setNow] = useState(() => liveSocket.serverNow())
  useEffect(() => {
    const timer = setInterval(() => setNow(liveSocket.serverNow()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
