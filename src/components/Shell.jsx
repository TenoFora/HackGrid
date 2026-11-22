import { useState } from 'react'
import logo from '../assets/Logo.png'
import { useAuth } from '../context/AuthContext'
import { initials } from '../lib/format'
import { useRecents, useTheme } from '../lib/hooks'

const NAV = [
  { to: '/', label: 'Explore' },
  { to: '/bookings', label: 'My bookings' },
  { to: '/teams', label: 'Teams' },
  { to: '/host', label: 'Host' },
]

const THEME_NEXT = { system: 'light', light: 'dark', dark: 'system' }
const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' }

function isActive(to, path) {
  if (to === '/') return path === '/' || path.startsWith('/event/')
  return path === to
}

export default function Shell({ path, children }) {
  const { user, signOut, data } = useAuth()
  const recents = useRecents()
  const [theme, setTheme] = useTheme()
  // The mobile drawer belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState(null)
  const open = openOn === path
  const setOpen = (value) => setOpenOn(value ? path : null)

  const heldCount = data.registrations.filter((r) => r.registration_status === 'HELD').length

  return (
    <div className="shell" data-nav-open={open || undefined}>
      <aside className="sidebar" aria-label="Main">
        <a href="#/" className="brand">
          <img src={logo} alt="" width="28" height="28" />
          <span>
            Hack<b>Grid</b>
          </span>
        </a>

        <a href="#/host" className="btn btn-primary btn-block sidebar-cta">
          Host a hackathon
        </a>

        <nav className="nav">
          {NAV.map((item) => (
            <a
              key={item.to}
              href={`#${item.to}`}
              className={isActive(item.to, path) ? 'is-active' : ''}
              aria-current={isActive(item.to, path) ? 'page' : undefined}
            >
              <span>{item.label}</span>
              {item.to === '/bookings' && heldCount > 0 && (
                <span className="nav-count" title="Bookings waiting for payment">
                  {heldCount}
                </span>
              )}
            </a>
          ))}
        </nav>

        {recents.length > 0 && (
          <div className="recents">
            <p className="sidebar-label">Recently viewed</p>
            {recents.map((event) => (
              <a
                key={event.event_id}
                href={`#/event/${event.event_id}`}
                className={path === `/event/${event.event_id}` ? 'is-active' : ''}
              >
                {event.event_name}
              </a>
            ))}
          </div>
        )}

        <div className="sidebar-foot">
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme(THEME_NEXT[theme])}
            aria-label={`Theme: ${THEME_LABEL[theme]}. Switch to ${THEME_LABEL[THEME_NEXT[theme]]}`}
          >
            Theme <span className="muted">{THEME_LABEL[theme]}</span>
          </button>
          {user ? (
            <div className="user-chip">
              <span className="avatar" aria-hidden="true">
                {initials(user.name)}
              </span>
              <span className="user-meta">
                <span className="user-name">{user.name}</span>
                <span className="user-id mono">ID {user.user_id}</span>
              </span>
              <button type="button" className="link-btn" onClick={signOut}>
                Log out
              </button>
            </div>
          ) : (
            <a href="#/login" className="btn btn-secondary btn-block">
              Log in
            </a>
          )}
        </div>
      </aside>

      <button
        type="button"
        className="scrim"
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
        onClick={() => setOpen(false)}
      />

      <div className="main">
        <header className="topbar">
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)} aria-expanded={open}>
            Menu
          </button>
          <a href="#/" className="brand brand-small">
            <img src={logo} alt="" width="24" height="24" />
            <span>
              Hack<b>Grid</b>
            </span>
          </a>
        </header>
        <main className="content" key={path}>
          {children}
        </main>
      </div>
    </div>
  )
}
