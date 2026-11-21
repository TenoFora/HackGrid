import './App.css'
import Redirect from './components/Redirect'
import Shell from './components/Shell'
import { ToastProvider } from './components/Toast'
import { AuthProvider, useAuth } from './context/AuthContext'
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
  else if (eventMatch) page = <EventPage key={eventMatch.id} id={eventMatch.id} />
  else if (PROTECTED[path]) {
    if (!user) return <Redirect to={`/login?next=${encodeURIComponent(path)}`} />
    const Page = PROTECTED[path]
    page = <Page />
  } else {
    page = (
      <div className="empty">
        <h3>Page not found</h3>
        <a href="#/" className="btn btn-secondary">
          Back to events
        </a>
      </div>
    )
  }

  return <Shell path={path}>{page}</Shell>
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes />
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
