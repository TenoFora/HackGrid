import { useState } from 'react'
import './styles/BookingsPage.css'
import { api } from '../api/client'
import { Button, EmptyState, FormError, PageHeader, StatusPill } from '../components/ui'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { countdown, dateTime, money, plural } from '../lib/format'
import { useNow } from '../lib/hooks'

const METHODS = [
  ['UPI', 'UPI'],
  ['CARD', 'Card'],
  ['NETBANKING', 'Net banking'],
  ['WALLET', 'Wallet'],
]

function effectiveStatus(registration, now) {
  if (
    registration.registration_status === 'HELD' &&
    new Date(registration.hold_expires_at).getTime() <= now
  ) {
    return 'EXPIRED'
  }
  return registration.registration_status
}

function PaymentForm({ registration, onDone }) {
  const { upsert } = useAuth()
  const notify = useToast()
  const [method, setMethod] = useState('UPI')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const payment = await api.createPayment({
        registration_id: registration.registration_id,
        payment_method: method,
      })
      upsert('registrations', { registration_id: registration.registration_id, payment }, 'registration_id')
      notify('Payment started. Your booking confirms once the gateway reports success.', 'good')
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="booking-form" onSubmit={handleSubmit}>
      <FormError message={error} />
      <fieldset className="method-grid">
        <legend>Payment method</legend>
        {METHODS.map(([value, label]) => (
          <label key={value} className={`method ${method === value ? 'is-active' : ''}`}>
            <input
              type="radio"
              name={`method-${registration.registration_id}`}
              value={value}
              checked={method === value}
              onChange={() => setMethod(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="booking-form-actions">
        <Button type="submit" busy={busy}>
          Pay {money(Number(registration.price) * Number(registration.attendee_count))}
        </Button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Not now
        </button>
      </div>
    </form>
  )
}

function ReviewForm({ registration, onDone }) {
  const { upsert } = useAuth()
  const notify = useToast()
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!rating) {
      setError('Pick a rating from 1 to 5.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.createReview({
        event_id: registration.event_id,
        rating,
        review_text: text.trim() || undefined,
      })
      upsert('registrations', { registration_id: registration.registration_id, reviewed: rating }, 'registration_id')
      notify('Thanks for the review.', 'good')
      onDone()
    } catch (err) {
      setError(err.status === 409 && /already/i.test(err.message) ? 'You already reviewed this event.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="booking-form" onSubmit={handleSubmit}>
      <FormError message={error} />
      <fieldset className="rating">
        <legend>Your rating</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={n <= rating ? 'is-active' : ''}
            aria-pressed={n === rating}
            aria-label={`${n} out of 5`}
            onClick={() => setRating(n)}
          >
            {n}
          </button>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor={`review-${registration.registration_id}`}>
          What stood out?<span className="field-optional">Optional</span>
        </label>
        <textarea
          id={`review-${registration.registration_id}`}
          rows={3}
          maxLength={10000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="booking-form-actions">
        <Button type="submit" busy={busy}>
          Submit review
        </Button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function BookingItem({ registration, now }) {
  const { upsert } = useAuth()
  const notify = useToast()
  const [panel, setPanel] = useState(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false)
  const status = effectiveStatus(registration, now)
  const msLeft = new Date(registration.hold_expires_at).getTime() - now
  const paymentPending = registration.payment?.payment_status === 'PENDING'

  async function handleCancel() {
    setBusy(true)
    try {
      const result = await api.cancelRegistration(registration.registration_id)
      upsert('registrations', { registration_id: registration.registration_id, ...result }, 'registration_id')
      notify('Booking cancelled. Your place was released.')
    } catch (err) {
      notify(err.message, 'bad')
    } finally {
      setBusy(false)
      setConfirmCancel(false)
    }
  }

  return (
    <li className="booking">
      <div className="booking-top">
        <div className="booking-info">
          <a href={`#/event/${registration.event_id}`} className="booking-name">
            {registration.event_name}
          </a>
          <p className="muted small">
            {registration.team_name ? `Team ${registration.team_name}` : 'Solo'}
            <span className="sep" aria-hidden="true" />
            {plural(registration.attendee_count, 'place')}
            <span className="sep" aria-hidden="true" />
            Starts {dateTime(registration.start_time)}
          </p>
        </div>
        <div className="booking-status">
          <StatusPill status={status} />
          {status === 'HELD' && (
            <span className="hold-timer mono" aria-label="Hold time remaining">
              {countdown(msLeft)}
            </span>
          )}
        </div>
      </div>

      {status === 'HELD' && paymentPending && (
        <p className="booking-note">
          Payment #{registration.payment.payment_id} via {registration.payment.payment_method.toLowerCase()} is
          waiting for gateway confirmation.
        </p>
      )}
      {status === 'EXPIRED' && <p className="booking-note">The 10 minute hold ran out. Register again if places remain.</p>}

      {panel === 'pay' && <PaymentForm registration={registration} onDone={() => setPanel(null)} />}
      {panel === 'review' && <ReviewForm registration={registration} onDone={() => setPanel(null)} />}

      {!panel && (
        <div className="booking-actions">
          {status === 'HELD' && !paymentPending && (
            <button type="button" className="btn btn-primary" onClick={() => setPanel('pay')}>
              Pay now
            </button>
          )}
          {status === 'CONFIRMED' && !registration.reviewed && (
            <button type="button" className="btn btn-secondary" onClick={() => setPanel('review')}>
              Leave a review
            </button>
          )}
          {status === 'CONFIRMED' && registration.reviewed && (
            <span className="muted small">You rated this {registration.reviewed} out of 5.</span>
          )}
          {(status === 'HELD' || status === 'PENDING') &&
            (confirmCancel ? (
              <span className="confirm">
                <span className="small">Release this place?</span>
                <Button variant="danger" busy={busy} onClick={handleCancel}>
                  Yes, cancel
                </Button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmCancel(false)}>
                  Keep it
                </button>
              </span>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmCancel(true)}>
                Cancel booking
              </button>
            ))}
        </div>
      )}
    </li>
  )
}

export default function BookingsPage() {
  const { data } = useAuth()
  const now = useNow(1000)
  const bookings = data.registrations

  const active = bookings.filter((r) => ['HELD', 'PENDING', 'CONFIRMED'].includes(effectiveStatus(r, now)))
  const past = bookings.filter((r) => !active.includes(r))

  return (
    <div className="page bookings">
      <PageHeader title="My bookings">
        Holds, confirmed places, and past registrations made from this device.
      </PageHeader>

      {bookings.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          action={
            <a href="#/" className="btn btn-primary">
              Explore hackathons
            </a>
          }
        >
          When you register for a hackathon, your hold and confirmation show up here.
        </EmptyState>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="section-title">Active</h2>
              <ul className="booking-list">
                {active.map((r) => (
                  <BookingItem key={r.registration_id} registration={r} now={now} />
                ))}
              </ul>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="section-title">History</h2>
              <ul className="booking-list booking-list-muted">
                {past.map((r) => (
                  <BookingItem key={r.registration_id} registration={r} now={now} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
