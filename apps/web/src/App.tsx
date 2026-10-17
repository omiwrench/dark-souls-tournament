import { APP_NAME } from '@dst/shared'
import { useHealth } from './api/health'
import styles from './App.module.css'

export function App() {
  const health = useHealth()
  const lit = health.isSuccess

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{APP_NAME}</h1>
      <p className={lit ? styles.lit : styles.unlit} role="status">
        {health.isPending ? 'Seeking a bonfire…' : lit ? 'Bonfire lit' : 'The bonfire has gone out'}
      </p>
      {lit && (
        <p className={styles.detail}>
          Server time {new Date(health.data.serverTime).toLocaleTimeString()}
        </p>
      )}
      {health.isError && <p className={styles.detail}>Is the server running?</p>}
    </main>
  )
}
