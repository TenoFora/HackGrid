import './App.css'
import Redirect from './components/Redirect'
import Shell from './components/Shell'
import { ToastProvider } from './components/Toast'
import { EmptyState } from './components/ui'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useDocumentTitle } from './lib/hooks'
import { matchPath, useHashRoute } from './lib/router'
import BookingsPage from './pages/BookingsPage'
import EventPage from './pages/EventPage'
import ExplorePage from './pages/ExplorePage'
import HostPage from './pages/HostPage'
import LoginPage from './pages/LoginPage'
import TeamsPage from './pages/TeamsPage'

const PROTECTED = {
  '/bookings': BookingsPage,
  '/teams': TeamsPage,
  '/host': HostPage,
}

function NotFound({ title, children }) {
  useDocumentTitle(title)
  return (
    <EmptyState
      title={title}
      action={
        <a href="#/" className="btn btn-secondary">
          Back to events
        </a>
      }
    >
      {children}
    </EmptyState>
  )
}

function Routes() {
  const { path, query } = useHashRoute()
  const { user } = useAuth()

  if (path === '/login' || path === '/signup') {
    if (user) return <Redirect to={query.get('next') || '/'} />
    return <LoginPage key={path} mode={path.slice(1)} next={query.get('next')} />
  }

  let page
  const eventMatch = matchPath('/event/:id', path)
  if (path === '/') page = <ExplorePage />
  else if (eventMatch) {
    // Event IDs are positive integers; anything else is a mistyped or broken link.
    page = /^[1-9]\d*$/.test(eventMatch.id) ? (
      <EventPage key={eventMatch.id} id={eventMatch.id} />
    ) : (
      <NotFound title="That event link doesn't look right">
        Event links end in a number, like /event/12. Pick an event from the list instead.
      </NotFound>
    )
  } else if (PROTECTED[path]) {
    if (!user) return <Redirect to={`/login?next=${encodeURIComponent(path)}`} />
    const Page = PROTECTED[path]
    page = <Page />
  } else {
    page = <NotFound title="Page not found">There is nothing at this address. It may have moved or been mistyped.</NotFound>
  }

  return <Shell path={path}>{page}</Shell>
}

// Toasts sit outside auth so the session layer can announce an expired login.
function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes />
      </AuthProvider>
    </ToastProvider>
  )
}

export default App
