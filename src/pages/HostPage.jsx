import { useState } from 'react'
import './styles/HostPage.css'
import { api, optional } from '../api/client'
import { Button, Field, FormError, PageHeader, Segmented, StatusPill } from '../components/ui'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { toMysqlDateTime } from '../lib/format'

function useForm(initial) {
  const [values, setValues] = useState(initial)
  const bind = (key) => ({
    value: values[key],
    onChange: (e) =>
      setValues((v) => ({ ...v, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })),
  })
  return [values, bind, setValues]
}

function EventForm({ onCreated }) {
  const { data, upsert } = useAuth()
  const notify = useToast()
  const owners = [
    ...data.organizers.map((o) => ({ key: `org:${o.organizer_id}`, label: `${o.organization_name} (organizer)` })),
    ...data.colleges.map((c) => ({ key: `col:${c.college_id}`, label: `${c.college_name} (college)` })),
  ]
  const [values, bind] = useForm({
    event_name: '',
    description: '',
    owner: owners[0]?.key ?? 'manual',
    manual_type: 'org',
    manual_id: '',
    venue_id: '',
    price: '0',
    capacity: '100',
    min_team_size: '1',
    max_team_size: '4',
    start_time: '',
    end_time: '',
    registration_deadline: '',
    publish: true,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function validate() {
    if (!values.event_name.trim()) return 'Give the event a name.'
    if (values.owner === 'manual' && !/^[1-9]\d*$/.test(values.manual_id.trim())) return 'Enter the organizer or college ID.'
    if (!/^[1-9]\d*$/.test(values.venue_id.trim())) return 'Enter a valid venue ID.'
    if (!/^\d+(\.\d{1,2})?$/.test(values.price.trim())) return 'Price must be a number with at most 2 decimals.'
    if (Number(values.min_team_size) > Number(values.max_team_size)) return 'Minimum team size cannot exceed the maximum.'
    if (!values.start_time || !values.end_time || !values.registration_deadline) return 'Set the start, end, and registration deadline.'
    if (values.end_time <= values.start_time) return 'The event must end after it starts.'
    if (values.registration_deadline > values.start_time) return 'Registration must close before the event starts.'
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError('')
    const [type, id] =
      values.owner === 'manual' ? [values.manual_type, values.manual_id.trim()] : values.owner.split(':')
    try {
      const created = await api.createEvent({
        event_name: values.event_name.trim(),
        description: optional(values.description),
        organizer_id: type === 'org' ? id : undefined,
        college_id: type === 'col' ? id : undefined,
        venue_id: values.venue_id.trim(),
        price: values.price.trim(),
        capacity: Number(values.capacity),
        min_team_size: Number(values.min_team_size),
        max_team_size: Number(values.max_team_size),
        start_time: toMysqlDateTime(values.start_time),
        end_time: toMysqlDateTime(values.end_time),
        registration_deadline: toMysqlDateTime(values.registration_deadline),
        status: values.publish ? 'PUBLISHED' : 'DRAFT',
      })
      upsert('events', { ...created, event_name: values.event_name.trim(), start_time: values.start_time }, 'event_id')
      notify(created.status === 'PUBLISHED' ? 'Event published.' : 'Draft saved.', 'good')
      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel host-form" onSubmit={handleSubmit} noValidate>
      <h2>Event details</h2>
      <FormError message={error} />

      <Field label="Event name" htmlFor="ev-name">
        <input id="ev-name" maxLength={200} {...bind('event_name')} />
      </Field>
      <Field label="Description" htmlFor="ev-desc" optional hint="Leave a blank line between paragraphs.">
        <textarea id="ev-desc" rows={5} maxLength={10000} {...bind('description')} />
      </Field>

      <div className="form-grid">
        <Field
          label="Hosted by"
          htmlFor="ev-owner"
          hint={owners.length ? undefined : 'Create an organizer or college profile first, or enter an ID.'}
        >
          <select id="ev-owner" {...bind('owner')}>
            {owners.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
            <option value="manual">Enter an ID</option>
          </select>
        </Field>
        <Field label="Venue ID" htmlFor="ev-venue" hint="From the venues table.">
          <input id="ev-venue" inputMode="numeric" {...bind('venue_id')} />
        </Field>
      </div>

      {values.owner === 'manual' && (
        <div className="form-grid">
          <Field label="Owner type" htmlFor="ev-mtype">
            <select id="ev-mtype" {...bind('manual_type')}>
              <option value="org">Organizer</option>
              <option value="col">College</option>
            </select>
          </Field>
          <Field label={values.manual_type === 'org' ? 'Organizer ID' : 'College ID'} htmlFor="ev-mid">
            <input id="ev-mid" inputMode="numeric" {...bind('manual_id')} />
          </Field>
        </div>
      )}

      <div className="form-grid form-grid-4">
        <Field label="Price (INR)" htmlFor="ev-price" hint="0 makes it free.">
          <input id="ev-price" inputMode="decimal" {...bind('price')} />
        </Field>
        <Field label="Capacity" htmlFor="ev-cap">
          <input id="ev-cap" type="number" min="1" {...bind('capacity')} />
        </Field>
        <Field label="Min team" htmlFor="ev-min">
          <input id="ev-min" type="number" min="1" {...bind('min_team_size')} />
        </Field>
        <Field label="Max team" htmlFor="ev-max">
          <input id="ev-max" type="number" min="1" {...bind('max_team_size')} />
        </Field>
      </div>

      <div className="form-grid form-grid-3">
        <Field label="Starts" htmlFor="ev-start">
          <input id="ev-start" type="datetime-local" {...bind('start_time')} />
        </Field>
        <Field label="Ends" htmlFor="ev-end">
          <input id="ev-end" type="datetime-local" {...bind('end_time')} />
        </Field>
        <Field label="Registration closes" htmlFor="ev-deadline">
          <input id="ev-deadline" type="datetime-local" {...bind('registration_deadline')} />
        </Field>
      </div>

      <label className="check">
        <input type="checkbox" checked={values.publish} onChange={bind('publish').onChange} />
        <span>
          Publish now
          <span className="muted small"> Unpublished events are saved as drafts and stay hidden.</span>
        </span>
      </label>

      <Button type="submit" busy={busy} className="btn-lg">
        {values.publish ? 'Publish event' : 'Save draft'}
      </Button>
    </form>
  )
}

function OrganizerForm({ onCreated }) {
  const { user, upsert } = useAuth()
  const notify = useToast()
  const [values, bind] = useForm({
    organization_name: '',
    organizer_type: 'COMMUNITY',
    contact_email: user.email,
    contact_phone: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const organizer = await api.createOrganizer({
        organization_name: values.organization_name.trim(),
        organizer_type: values.organizer_type,
        contact_email: values.contact_email.trim(),
        contact_phone: optional(values.contact_phone),
      })
      upsert('organizers', organizer, 'organizer_id')
      notify(`${organizer.organization_name} is ready to host events.`, 'good')
      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel host-form" onSubmit={handleSubmit}>
      <h2>Organizer profile</h2>
      <p className="muted small">For communities, companies, and individuals running their own hackathons.</p>
      <FormError message={error} />
      <Field label="Organization name" htmlFor="org-name">
        <input id="org-name" maxLength={150} required {...bind('organization_name')} />
      </Field>
      <div className="form-grid">
        <Field label="Type" htmlFor="org-type">
          <select id="org-type" {...bind('organizer_type')}>
            <option value="COMMUNITY">Community</option>
            <option value="COMPANY">Company</option>
            <option value="INDIVIDUAL">Individual</option>
          </select>
        </Field>
        <Field label="Contact phone" htmlFor="org-phone" optional>
          <input id="org-phone" type="tel" maxLength={20} {...bind('contact_phone')} />
        </Field>
      </div>
      <Field label="Contact email" htmlFor="org-email">
        <input id="org-email" type="email" required {...bind('contact_email')} />
      </Field>
      <Button type="submit" busy={busy}>
        Create organizer
      </Button>
    </form>
  )
}

function CollegeForm({ onCreated }) {
  const { upsert } = useAuth()
  const notify = useToast()
  const [values, bind] = useForm({
    college_name: '',
    college_email: '',
    address: '',
    city: '',
    state: '',
    country: 'India',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const college = await api.createCollege({
        college_name: values.college_name.trim(),
        college_email: optional(values.college_email),
        address: optional(values.address),
        city: optional(values.city),
        state: optional(values.state),
        country: optional(values.country),
      })
      upsert('colleges', college, 'college_id')
      notify(`${college.college_name} registered. You are its admin.`, 'good')
      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel host-form" onSubmit={handleSubmit}>
      <h2>Register a college</h2>
      <p className="muted small">You become the college admin and can publish campus hackathons.</p>
      <FormError message={error} />
      <Field label="College name" htmlFor="col-name">
        <input id="col-name" maxLength={200} required {...bind('college_name')} />
      </Field>
      <Field label="College email" htmlFor="col-email" optional>
        <input id="col-email" type="email" {...bind('college_email')} />
      </Field>
      <Field label="Address" htmlFor="col-address" optional>
        <input id="col-address" {...bind('address')} />
      </Field>
      <div className="form-grid form-grid-3">
        <Field label="City" htmlFor="col-city" optional>
          <input id="col-city" maxLength={100} {...bind('city')} />
        </Field>
        <Field label="State" htmlFor="col-state" optional>
          <input id="col-state" maxLength={100} {...bind('state')} />
        </Field>
        <Field label="Country" htmlFor="col-country">
          <input id="col-country" maxLength={100} {...bind('country')} />
        </Field>
      </div>
      <Button type="submit" busy={busy}>
        Register college
      </Button>
    </form>
  )
}

export default function HostPage() {
  const { data } = useAuth()
  const hasProfile = data.organizers.length + data.colleges.length > 0
  const [tab, setTab] = useState(hasProfile ? 'event' : 'organizer')
  const [formKey, setFormKey] = useState(0)

  const reset = (nextTab) => () => {
    setFormKey((k) => k + 1)
    if (nextTab) setTab(nextTab)
  }

  return (
    <div className="page host">
      <PageHeader title="Host a hackathon">
        Set up who's hosting, then publish an event with capacity and team rules.
      </PageHeader>

      <Segmented
        label="What to create"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'event', label: 'Event' },
          { value: 'organizer', label: 'Organizer' },
          { value: 'college', label: 'College' },
        ]}
      />

      <div className="host-layout">
        <div key={`${tab}-${formKey}`}>
          {tab === 'event' && <EventForm onCreated={reset()} />}
          {tab === 'organizer' && <OrganizerForm onCreated={reset('event')} />}
          {tab === 'college' && <CollegeForm onCreated={reset('event')} />}
        </div>

        <aside className="host-aside">
          <div className="panel">
            <h2>Your hosting profiles</h2>
            {hasProfile ? (
              <ul className="plain-list">
                {data.organizers.map((o) => (
                  <li key={`o${o.organizer_id}`}>
                    <span>{o.organization_name}</span>
                    <span className="muted small mono">Organizer #{o.organizer_id}</span>
                  </li>
                ))}
                {data.colleges.map((c) => (
                  <li key={`c${c.college_id}`}>
                    <span>{c.college_name}</span>
                    <span className="muted small mono">College #{c.college_id}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">None yet. An event needs exactly one organizer or college behind it.</p>
            )}
          </div>

          <div className="panel">
            <h2>Your events</h2>
            {data.events.length ? (
              <ul className="plain-list">
                {data.events.map((ev) => (
                  <li key={ev.event_id}>
                    {ev.status === 'PUBLISHED' ? (
                      <a href={`#/event/${ev.event_id}`}>{ev.event_name}</a>
                    ) : (
                      <span>{ev.event_name}</span>
                    )}
                    <StatusPill status={ev.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Events you create here are listed for quick access.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
