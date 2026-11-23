import { useEffect, useState } from 'react'
import './styles/ExplorePage.css'
import { api } from '../api/client'
import { CapacityMeter, EmptyState, SkeletonRows } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { explainError } from '../lib/errors'
import { dayMonth, greeting, isPast, money, plural } from '../lib/format'
import { useDocumentTitle } from '../lib/hooks'

function EventRow({ event }) {
  const { day, month } = dayMonth(event.start_time)
  const closed = isPast(event.registration_deadline)
  const teamSize =
    Number(event.max_team_size) === 1
      ? 'Solo'
      : `Teams of ${event.min_team_size}-${event.max_team_size}`

  return (
    <a href={`#/event/${event.event_id}`} className="event-row">
      <span className="event-date">
        <span className="event-day mono">{day}</span>
        <span className="event-month">{month}</span>
      </span>
      <span className="event-main">
        <span className="event-name">{event.event_name}</span>
        <span className="event-meta">
          {event.venue_name}
          {event.city ? `, ${event.city}` : ''}
          <span className="sep" aria-hidden="true" />
          {teamSize}
        </span>
      </span>
      <span className="event-side">
        <span className="event-price">{money(event.price)}</span>
        {closed ? (
          <span className="muted small">Registration closed</span>
        ) : (
          <CapacityMeter remaining={event.remaining_capacity} capacity={event.capacity} compact />
        )}
      </span>
    </a>
  )
}

export default function ExplorePage() {
  const { user } = useAuth()
  useDocumentTitle('Explore hackathons')
  const [draft, setDraft] = useState('')
  const [filters, setFilters] = useState({ search: '', city: '' })
  const [cities, setCities] = useState([])
  const [reload, setReload] = useState(0)
  const requestKey = `${filters.search}|${filters.city}|${reload}`
  const [result, setResult] = useState({ key: null, status: 'ready', events: [], error: '' })
  // Loading is derived: the last result belongs to a different request.
  const state = result.key === requestKey ? result : { ...result, status: 'loading' }

  useEffect(() => {
    let cancelled = false
    api
      .listEvents(filters)
      .then(({ events }) => {
        if (cancelled) return
        setResult({ key: requestKey, status: 'ready', events, error: '' })
        if (!filters.search && !filters.city) {
          setCities([...new Set(events.map((e) => e.city).filter(Boolean))].sort())
        }
      })
      .catch((err) => {
        if (!cancelled) setResult({ key: requestKey, status: 'error', events: [], error: explainError(err, 'load') })
      })
    return () => {
      cancelled = true
    }
  }, [filters, requestKey])

  const open = state.events.filter((e) => !isPast(e.registration_deadline))
  const closed = state.events.filter((e) => isPast(e.registration_deadline))
  const filtered = Boolean(filters.search || filters.city)

  function handleSearch(event) {
    event.preventDefault()
    setFilters((f) => ({ ...f, search: draft.trim() }))
  }

  function clearFilters() {
    setDraft('')
    setFilters({ search: '', city: '' })
  }

  return (
    <div className="explore">
      <section className="explore-hero">
        <h1>{user ? greeting(user.name) : 'Find your next hackathon'}</h1>
        <p className="muted">
          {user
            ? 'What are you building next? Search published hackathons and hold a seat.'
            : 'Discover published hackathons, check live seats, and register solo or as a team.'}
        </p>

        <form className="composer" onSubmit={handleSearch} role="search">
          <label htmlFor="search" className="sr-only">
            Search hackathons by name
          </label>
          <input
            id="search"
            type="search"
            placeholder="Search hackathons by name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="composer-bar">
            <label htmlFor="city" className="sr-only">
              City
            </label>
            <select
              id="city"
              value={filters.city}
              onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
            >
              <option value="">All cities</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary">
              Search
            </button>
          </div>
        </form>
      </section>

      <section className="explore-results" aria-live="polite" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && <SkeletonRows />}

        {state.status === 'error' && (
          <EmptyState
            title="Events could not load"
            action={
              <button type="button" className="btn btn-secondary" onClick={() => setReload((n) => n + 1)}>
                Try again
              </button>
            }
          >
            {state.error.message} {state.error.hint}
          </EmptyState>
        )}

        {state.status === 'ready' && state.events.length === 0 && (
          <EmptyState
            title={filtered ? 'No hackathons match' : 'No hackathons published yet'}
            action={
              filtered ? (
                <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : (
                <a href="#/host" className="btn btn-secondary">
                  Host the first one
                </a>
              )
            }
          >
            {filtered
              ? 'Try a shorter name or a different city.'
              : 'Organizers and college admins can publish an event from the Host page.'}
          </EmptyState>
        )}

        {state.status === 'ready' && open.length > 0 && (
          <div className="result-group">
            <div className="result-head">
              <h2>{plural(open.length, 'hackathon')} open for registration</h2>
              {filtered && (
                <button type="button" className="link-btn" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
            <div className="event-list">
              {open.map((event) => (
                <EventRow key={event.event_id} event={event} />
              ))}
            </div>
          </div>
        )}

        {state.status === 'ready' && closed.length > 0 && (
          <div className="result-group">
            <div className="result-head">
              <h2>Registration closed</h2>
            </div>
            <div className="event-list event-list-muted">
              {closed.map((event) => (
                <EventRow key={event.event_id} event={event} />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
