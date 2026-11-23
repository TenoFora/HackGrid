import { useEffect, useState } from 'react'
import './styles/EventPage.css'
import { api } from '../api/client'
import { Button, CapacityMeter, EmptyState, FormError, Segmented, StatusPill } from '../components/ui'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { explainError } from '../lib/errors'
import { countdown, dateTime, isPast, money, plural } from '../lib/format'
import { addRecent, useAvailability, useDocumentTitle, useNow } from '../lib/hooks'
import { navigate } from '../lib/router'

function LiveCapacity({ live, event }) {
  const now = useNow(1000)
  const data = live.data ?? event
  const seconds = live.updatedAt ? Math.round((now - live.updatedAt) / 1000) : null

  return (
    <div className="panel live">
      <div className="live-head">
        <h2>Live availability</h2>
        <span className="live-status">
          <span className={`live-dot ${live.error ? 'is-off' : ''}`} aria-hidden="true" />
          {live.error ? 'Offline' : seconds == null ? 'Connecting' : seconds < 2 ? 'Just updated' : `Updated ${seconds}s ago`}
        </span>
      </div>
      <p className="live-number mono">{data.remaining_capacity}</p>
      <p className="muted">
        places left of {data.capacity}
        {live.data ? `, ${live.data.booked} booked or on hold` : ''}
      </p>
      <CapacityMeter remaining={data.remaining_capacity} capacity={data.capacity} compact />
    </div>
  )
}

function RegisterPanel({ event, live }) {
  const { user, data, upsert } = useAuth()
  const notify = useToast()
  const now = useNow(1000)
  const minTeam = Number(event.min_team_size)
  const maxTeam = Number(event.max_team_size)
  const soloAllowed = minTeam <= 1
  const teamAllowed = maxTeam > 1
  const [mode, setMode] = useState(soloAllowed ? 'solo' : 'team')
  const [teamId, setTeamId] = useState(data.teams[0]?.team_id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const existing = data.registrations.find(
    (r) =>
      String(r.event_id) === String(event.event_id) &&
      (r.registration_status === 'CONFIRMED' ||
        (r.registration_status === 'HELD' && new Date(r.hold_expires_at).getTime() > now)),
  )
  const remaining = Number(live.data?.remaining_capacity ?? event.remaining_capacity)
  const closed = isPast(event.registration_deadline)
  const team = data.teams.find((t) => String(t.team_id) === String(teamId))
  const teamSize = team ? 1 + (team.members?.length ?? 0) : 0

  // Someone who already registered keeps seeing their booking after the deadline.
  if (closed && !existing) {
    return (
      <div className="panel">
        <h2>Registration closed</h2>
        <p className="muted">The deadline was {dateTime(event.registration_deadline)}.</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="panel">
        <h2>Register</h2>
        <p className="muted">Log in to hold a place for yourself or your team.</p>
        <a href={`#/login?next=${encodeURIComponent(`/event/${event.event_id}`)}`} className="btn btn-primary btn-block">
          Log in to register
        </a>
      </div>
    )
  }

  if (existing) {
    const held = existing.registration_status === 'HELD'
    return (
      <div className="panel">
        <div className="panel-title-row">
          <h2>You're registered</h2>
          <StatusPill status={existing.registration_status} />
        </div>
        {held ? (
          <p className="muted">
            Your hold expires in{' '}
            <strong className="mono">{countdown(new Date(existing.hold_expires_at).getTime() - now)}</strong>. Pay to
            confirm your place.
          </p>
        ) : (
          <p className="muted">
            {plural(existing.attendee_count, 'place')} confirmed{existing.team_name ? ` for ${existing.team_name}` : ''}.
          </p>
        )}
        <a href="#/bookings" className="btn btn-primary btn-block">
          {held ? 'Pay now' : 'View booking'}
        </a>
      </div>
    )
  }

  async function handleRegister(e) {
    e.preventDefault()
    setError(null)
    if (mode === 'team' && !team) {
      setError({ message: 'Choose a team first.', hint: 'Create one on the Teams page if you have none yet.' })
      return
    }
    setBusy(true)
    try {
      const registration = await api.createRegistration({
        event_id: event.event_id,
        team_id: mode === 'team' ? team.team_id : undefined,
      })
      upsert(
        'registrations',
        {
          ...registration,
          registration_id: String(registration.registration_id),
          event_id: String(event.event_id),
          event_name: event.event_name,
          price: event.price,
          start_time: event.start_time,
          team_id: mode === 'team' ? team.team_id : null,
          team_name: mode === 'team' ? team.team_name : null,
        },
        'registration_id',
      )
      notify(
        registration.registration_status === 'HELD'
          ? 'Place held for 10 minutes. Complete payment to confirm.'
          : 'You are registered.',
        'good',
      )
      live.refresh()
    } catch (err) {
      setError(explainError(err, 'register'))
      live.refresh()
    } finally {
      setBusy(false)
    }
  }

  const free = Number(event.price) === 0
  const attendees = mode === 'team' ? teamSize || minTeam : 1

  return (
    <form className="panel" onSubmit={handleRegister}>
      <h2>Register</h2>
      <FormError error={error} />

      {soloAllowed && teamAllowed && (
        <Segmented
          label="Register as"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'solo', label: 'Solo' },
            { value: 'team', label: 'Team' },
          ]}
        />
      )}

      {!soloAllowed && <p className="small muted">This event needs teams of {minTeam} to {maxTeam}.</p>}

      {mode === 'team' &&
        (data.teams.length ? (
          <div className="field">
            <label htmlFor="team">Team</label>
            <select id="team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {data.teams.map((t) => (
                <option key={t.team_id} value={t.team_id}>
                  {t.team_name} ({plural(1 + (t.members?.length ?? 0), 'member')})
                </option>
              ))}
            </select>
            {team && (teamSize < minTeam || teamSize > maxTeam) && (
              <p className="field-hint">
                This event takes {minTeam} to {maxTeam} people. Your team has {teamSize} on this device.
              </p>
            )}
          </div>
        ) : (
          <p className="small muted">
            You don't lead any teams yet. <a href="#/teams">Create a team</a> first.
          </p>
        ))}

      <dl className="summary">
        <div>
          <dt>Places</dt>
          <dd className="mono">{attendees}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{free ? 'Free' : money(Number(event.price) * attendees)}</dd>
        </div>
      </dl>

      <Button type="submit" busy={busy} className="btn-block btn-lg" disabled={remaining === 0}>
        {remaining === 0 ? 'Sold out' : free ? 'Register' : 'Hold my place'}
      </Button>
      {!free && remaining > 0 && <p className="small muted center">Paid events hold your place for 10 minutes.</p>}
    </form>
  )
}

export default function EventPage({ id }) {
  const [state, setState] = useState({ status: 'loading', event: null, error: null })
  // Only poll once the event is known to exist, so a bad link doesn't ping the API forever.
  const live = useAvailability(id, { enabled: state.status === 'ready' })
  useDocumentTitle(state.event?.event_name ?? 'Event')

  useEffect(() => {
    let cancelled = false
    // There is no GET /events/:id yet, so the event is found in the public list.
    api
      .listEvents()
      .then(({ events }) => {
        if (cancelled) return
        const event = events.find((e) => String(e.event_id) === String(id))
        setState({ status: event ? 'ready' : 'missing', event, error: null })
        if (event) addRecent(event)
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', event: null, error: explainError(err, 'load') })
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (state.status === 'loading') {
    return (
      <div className="event-page">
        <div className="skeleton skeleton-heading" />
        <div className="skeleton skeleton-block" />
      </div>
    )
  }

  if (state.status !== 'ready') {
    return (
      <EmptyState
        title={state.status === 'missing' ? 'Event not found' : 'Event could not load'}
        action={
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
            Back to events
          </button>
        }
      >
        {state.status === 'missing'
          ? "This hackathon isn't published, or it no longer exists. Check the link, or pick one from the list."
          : `${state.error.message} ${state.error.hint}`}
      </EmptyState>
    )
  }

  const { event } = state
  const facts = [
    ['Starts', dateTime(event.start_time)],
    ['Ends', dateTime(event.end_time)],
    ['Registration closes', dateTime(event.registration_deadline)],
    ['Venue', `${event.venue_name}${event.city ? `, ${event.city}` : ''}`],
    [
      'Team size',
      Number(event.max_team_size) === 1 ? 'Solo only' : `${event.min_team_size} to ${event.max_team_size} people`,
    ],
    ['Price', `${money(event.price)}${Number(event.price) ? ' per person' : ''}`],
  ]

  return (
    <div className="event-page">
      <a href="#/" className="crumb">
        All events
      </a>
      <header className="event-header">
        <h1>{event.event_name}</h1>
        <p className="event-where muted">
          {event.venue_name}
          {event.city ? `, ${event.city}` : ''}
        </p>
      </header>
      <div className="event-layout">
        <article className="event-body">
          <dl className="facts">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          <section className="event-about">
            <h2>About</h2>
            {event.description ? (
              event.description.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)
            ) : (
              <p className="muted">The organizer hasn't added a description yet.</p>
            )}
          </section>
        </article>

        <aside className="event-aside">
          <LiveCapacity live={live} event={event} />
          <RegisterPanel event={event} live={live} />
        </aside>
      </div>
    </div>
  )
}
