import { useState } from 'react'
import './styles/HostPage.css'
import { api, optional } from '../api/client'
import { Button, Field, FormError, PageHeader, Segmented, StatusPill } from '../components/ui'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { explainError } from '../lib/errors'
import { toMysqlDateTime } from '../lib/format'
import { useDocumentTitle } from '../lib/hooks'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isId = (value) => /^[1-9]\d*$/.test(String(value).trim())
const isWhole = (value) => value !== '' && Number.isInteger(Number(value)) && Number(value) >= 1

// A validation problem: which input to blame, what is wrong, and how to fix it.
const problem = (id, message, hint) => ({ id, message, hint })

function useForm(initial, onEdit) {
  const [values, setValues] = useState(initial)
  const bind = (key) => ({
    value: values[key],
    onChange: (e) => {
      setValues((v) => ({ ...v, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
      onEdit?.()
    },
  })
  return [values, bind]
}

// Shows a client-side problem under its own field and moves focus there.
function useProblem() {
  const [found, setFound] = useState(null)
  const show = (p) => {
    setFound(p)
    if (p) document.getElementById(p.id)?.focus()
    return Boolean(p)
  }
  const at = (id) => (found?.id === id ? `${found.message} ${found.hint}` : undefined)
  return { show, at, clear: () => setFound(null) }
}

function EventForm({ onCreated }) {
  const { data, upsert } = useAuth()
  const notify = useToast()
  const owners = [
    ...data.organizers.map((o) => ({ key: `org:${o.organizer_id}`, label: `${o.organization_name} (organizer)` })),
    ...data.colleges.map((c) => ({ key: `col:${c.college_id}`, label: `${c.college_name} (college)` })),
  ]
  const issue = useProblem()
  const [values, bind] = useForm(
    {
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
    },
    issue.clear,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function validate() {
    const manualLabel = values.manual_type === 'org' ? 'organizer' : 'college'
    if (!values.event_name.trim()) return problem('ev-name', 'Give the event a name.', 'This is the title people see in the list.')
    if (values.owner === 'manual' && !isId(values.manual_id)) {
      return problem('ev-mid', `Enter the ${manualLabel} ID.`, 'It is a whole number. Create a profile on the Organizer or College tab to get one.')
    }
    if (!isId(values.venue_id)) return problem('ev-venue', 'Enter the venue ID.', 'It is a whole number from the venues table.')
    if (!/^\d+(\.\d{1,2})?$/.test(values.price.trim())) {
      return problem('ev-price', 'Price must be a plain amount.', 'Use digits only, like 499 or 499.50, with no commas or currency signs. Enter 0 for a free event.')
    }
    if (!isWhole(values.capacity)) return problem('ev-cap', 'Capacity must be a whole number of at least 1.', 'This is the total number of places.')
    if (!isWhole(values.min_team_size)) return problem('ev-min', 'Minimum team size must be at least 1.', 'Use 1 if people can enter alone.')
    if (!isWhole(values.max_team_size)) return problem('ev-max', 'Maximum team size must be at least 1.', 'Use 1 for a solo-only event.')
    if (Number(values.min_team_size) > Number(values.max_team_size)) {
      return problem('ev-min', 'The minimum team size is larger than the maximum.', 'Lower the minimum or raise the maximum.')
    }
    const missing = [
      ['ev-start', values.start_time],
      ['ev-end', values.end_time],
      ['ev-deadline', values.registration_deadline],
    ].find(([, value]) => !value)
    if (missing) return problem(missing[0], 'Set the start, end and registration deadline.', 'All three are needed so people know when to act.')
    if (values.end_time <= values.start_time) return problem('ev-end', 'The event must end after it starts.', 'Move the end time later.')
    if (values.registration_deadline > values.start_time) {
      return problem('ev-deadline', 'Registration must close before the event starts.', 'Choose a deadline on or before the start time.')
    }
    if (values.publish && new Date(values.registration_deadline).getTime() <= Date.now()) {
      return problem('ev-deadline', 'That registration deadline has already passed.', 'Nobody could register. Pick a later time, or untick "Publish now" to save a draft.')
    }
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (issue.show(validate())) return

    setBusy(true)
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
      notify(created.status === 'PUBLISHED' ? 'Event published.' : 'Draft saved. It stays hidden until you publish it.', 'good')
      onCreated()
    } catch (err) {
      setError(explainError(err, 'createEvent'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel host-form" onSubmit={handleSubmit} noValidate>
      <h2>Event details</h2>
      <FormError error={error} />

      <Field label="Event name" htmlFor="ev-name" error={issue.at('ev-name')}>
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
        <Field label="Venue ID" htmlFor="ev-venue" hint="From the venues table." error={issue.at('ev-venue')}>
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
          <Field
            label={values.manual_type === 'org' ? 'Organizer ID' : 'College ID'}
            htmlFor="ev-mid"
            error={issue.at('ev-mid')}
          >
            <input id="ev-mid" inputMode="numeric" {...bind('manual_id')} />
          </Field>
        </div>
      )}

      <div className="form-grid form-grid-4">
        <Field label="Price (INR)" htmlFor="ev-price" hint="0 makes it free." error={issue.at('ev-price')}>
          <input id="ev-price" inputMode="decimal" {...bind('price')} />
        </Field>
        <Field label="Capacity" htmlFor="ev-cap" error={issue.at('ev-cap')}>
          <input id="ev-cap" type="number" min="1" {...bind('capacity')} />
        </Field>
        <Field label="Min team" htmlFor="ev-min" error={issue.at('ev-min')}>
          <input id="ev-min" type="number" min="1" {...bind('min_team_size')} />
        </Field>
        <Field label="Max team" htmlFor="ev-max" error={issue.at('ev-max')}>
          <input id="ev-max" type="number" min="1" {...bind('max_team_size')} />
        </Field>
      </div>

      <div className="form-grid form-grid-3">
        <Field label="Starts" htmlFor="ev-start" error={issue.at('ev-start')}>
          <input id="ev-start" type="datetime-local" {...bind('start_time')} />
        </Field>
        <Field label="Ends" htmlFor="ev-end" error={issue.at('ev-end')}>
          <input id="ev-end" type="datetime-local" {...bind('end_time')} />
        </Field>
        <Field label="Registration closes" htmlFor="ev-deadline" error={issue.at('ev-deadline')}>
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
  const issue = useProblem()
  const [values, bind] = useForm(
    {
      organization_name: '',
      organizer_type: 'COMMUNITY',
      contact_email: user.email,
      contact_phone: '',
    },
    issue.clear,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!values.organization_name.trim()) {
      issue.show(problem('org-name', 'Enter the organization name.', 'It appears on every event you host.'))
      return
    }
    if (!EMAIL.test(values.contact_email.trim())) {
      issue.show(problem('org-email', 'That contact email looks incomplete.', 'It should look like name@example.com.'))
      return
    }
    setBusy(true)
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
      setError(explainError(err, 'createOrganizer'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel host-form" onSubmit={handleSubmit} noValidate>
      <h2>Organizer profile</h2>
      <p className="muted small">For communities, companies, and individuals running their own hackathons.</p>
      <FormError error={error} />
      <Field label="Organization name" htmlFor="org-name" error={issue.at('org-name')}>
        <input id="org-name" maxLength={150} {...bind('organization_name')} />
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
      <Field label="Contact email" htmlFor="org-email" error={issue.at('org-email')}>
        <input id="org-email" type="email" {...bind('contact_email')} />
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
  const issue = useProblem()
  const [values, bind] = useForm(
    {
      college_name: '',
      college_email: '',
      address: '',
      city: '',
      state: '',
      country: 'India',
    },
    issue.clear,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!values.college_name.trim()) {
      issue.show(problem('col-name', 'Enter the college name.', 'Use the full official name.'))
      return
    }
    if (values.college_email.trim() && !EMAIL.test(values.college_email.trim())) {
      issue.show(problem('col-email', 'That college email looks incomplete.', 'It should look like admissions@college.edu, or leave it blank.'))
      return
    }
    setBusy(true)
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
      setError(explainError(err, 'createCollege'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel host-form" onSubmit={handleSubmit} noValidate>
      <h2>Register a college</h2>
      <p className="muted small">You become the college admin and can publish campus hackathons.</p>
      <FormError error={error} />
      <Field label="College name" htmlFor="col-name" error={issue.at('col-name')}>
        <input id="col-name" maxLength={200} {...bind('college_name')} />
      </Field>
      <Field label="College email" htmlFor="col-email" optional error={issue.at('col-email')}>
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
  useDocumentTitle('Host a hackathon')
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
