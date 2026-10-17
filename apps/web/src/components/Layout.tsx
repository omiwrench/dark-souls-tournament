import { Link, NavLink, Outlet } from 'react-router'
import styles from './Layout.module.css'

export function Layout() {
  return (
    <div className={styles.layout}>
      <header className={styles.bar}>
        <Link to="/" className={styles.brand}>
          <span aria-hidden>🔥</span> Dark Souls Tournament
        </Link>
        <nav className={styles.nav}>
          <NavLink to="/" end>
            Matches
          </NavLink>
          <NavLink to="/matches/new">New match</NavLink>
          <NavLink to="/players">Players</NavLink>
          <NavLink to="/rulesets">Rulesets</NavLink>
        </nav>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
