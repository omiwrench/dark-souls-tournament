import { useSyncExternalStore } from 'react'
import { liveSocket } from './socket'

export function useConnected() {
  return useSyncExternalStore(
    (listener) => liveSocket.onStatusChange(listener),
    () => liveSocket.connected,
    // Server rendering (tests): assume connected so no warning is shown.
    () => true,
  )
}
