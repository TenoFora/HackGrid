import { useState } from 'react'
import './styles/TeamsPage.css'
import { api } from '../api/client'
import { Button, EmptyState, Field, FormError, PageHeader } from '../components/ui'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { errorText, explainError } from '../lib/errors'
import { plural } from '../lib/format'
import { useDocumentTitle } from '../lib/hooks'

function AddMemberForm({ team }) {
  const { user, upsert } = useAuth()
  const notify = useToast()
  const [userId, setUserId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputId = `member-${team.team_id}`

  async function handleSubmit(e) {
    e.preventDefault()
    const id = userId.trim()
    // These checks catch mistakes instantly, without waiting on the server.
    if (!/^[1-9]\d*$/.test(id)) {
      setError('User IDs are whole numbers, like 12. Your teammate can copy theirs from their Teams page.')
      return
    }
    if (id === String(user.user_id)) {
      setError("That's your own ID. You're already on the team as its leader.")
      return
    }
    if ((team.members ?? []).includes(id)) {
      setError(`User ${id} is already on ${team.team_name}.`)
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.addTeamMember(team.team_id, id)
      upsert('teams', { team_id: team.team_id, members: [...(team.members ?? []), id] }, 'team_id')
      notify(`User ${id} added to ${team.team_name}.`, 'good')
      setUserId('')
    } catch (err) {
      setError(errorText(err, 'addMember'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <Field
        label="Add a member by user ID"
        htmlFor={inputId}
        hint="Teammates find their ID at the bottom of the sidebar."
        error={error}
      >
        <div className="input-row">
          <input
            id={inputId}
            inputMode="numeric"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : `${inputId}-hint`}
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value)
              if (error) setError('')
            }}
          />
          <Button type="submit" variant="secondary" busy={busy}>
            Add
          </Button>
        </div>
      </Field>
    </form>
  )
}

export default function TeamsPage() {
  const { user, data, upsert } = useAuth()
  useDocumentTitle('Teams')
  const notify = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) {
      setError({ message: 'Give your team a name.', hint: 'Organizers see this name on the registration.' })
      document.getElementById('team-name')?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const team = await api.createTeam({ team_name: name.trim() })
      upsert('teams', { ...team, members: [] }, 'team_id')
      notify(`Team ${team.team_name} created. You are the leader.`, 'good')
      setName('')
    } catch (err) {
      setError(explainError(err, 'createTeam'))
    } finally {
      setBusy(false)
    }
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(user.user_id)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      notify(`Your browser blocked copying. Your ID is ${user.user_id}.`)
    }
  }

  return (
    <div className="page teams">
      <PageHeader title="Teams">Create a team, add teammates, then register the whole team in one go.</PageHeader>

      <div className="teams-grid">
        <form className="panel" onSubmit={handleCreate}>
          <h2>New team</h2>
          <FormError error={error} />
          <Field label="Team name" htmlFor="team-name">
            <input id="team-name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button type="submit" busy={busy}>
            Create team
          </Button>
        </form>

        <div className="panel my-id">
          <h2>Your user ID</h2>
          <p className="muted small">Share this with a team leader so they can add you.</p>
          <div className="id-row">
            <span className="id-value mono">{user.user_id}</span>
            <button type="button" className="btn btn-secondary" onClick={copyId}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      <section>
        <h2 className="section-title">Teams you lead</h2>
        {data.teams.length === 0 ? (
          <EmptyState title="No teams yet">Create a team above. You become its leader automatically.</EmptyState>
        ) : (
          <ul className="team-list">
            {data.teams.map((team) => {
              const members = team.members ?? []
              return (
                <li key={team.team_id} className="team">
                  <div className="team-head">
                    <h3>{team.team_name}</h3>
                    <span className="muted small mono">Team #{team.team_id}</span>
                  </div>
                  <p className="muted small">{plural(members.length + 1, 'member')}</p>
                  <ul className="member-chips">
                    <li className="chip chip-leader">You, leader</li>
                    {members.map((id) => (
                      <li key={id} className="chip mono">
                        User {id}
                      </li>
                    ))}
                  </ul>
                  <AddMemberForm team={team} />
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
