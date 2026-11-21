import { useState } from 'react'
import './styles/LoginPage.css'
import logo from '../assets/LOGO_W_TEXT.png'
import { api, optional } from '../api/client'
import { Button, Field, FormError } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { navigate } from '../lib/router'

function LoginPage({ mode = 'login', next }) {
  const { signIn, expired, clearExpired } = useAuth()
  const isSignup = mode === 'signup'
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const destination = next && next.startsWith('/') ? next : '/'
  const otherHref = `#/${isSignup ? 'login' : 'signup'}${next ? `?next=${encodeURIComponent(next)}` : ''}`

  const update = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (isSignup && form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setBusy(true)
    try {
      const session = isSignup
        ? await api.register({
            name: form.name.trim(),
            email: form.email.trim(),
            phone: optional(form.phone),
            password: form.password,
          })
        : await api.login({ email: form.email.trim(), password: form.password })
      signIn(session)
      clearExpired()
      navigate(destination)
    } catch (err) {
      setError(err.status === 409 ? 'An account with this email already exists. Try logging in.' : err.message)
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <section className="login-brand" aria-hidden="true">
        <img src={logo} alt="" />
      </section>

      <section className="login-panel">
        <a href="#/" className="login-back">
          Back to events
        </a>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="muted">
            {isSignup
              ? 'Register solo or with a team, and hold seats in real time.'
              : 'Log in to register, manage your team, and track bookings.'}
          </p>

          {expired && !error && (
            <div className="form-note">Your session expired. Please log in again.</div>
          )}
          <FormError message={error} />

          {isSignup && (
            <Field label="Full name" htmlFor="name">
              <input id="name" autoComplete="name" required maxLength={100} value={form.name} onChange={update('name')} />
            </Field>
          )}

          <Field label="Email" htmlFor="email">
            <input id="email" type="email" autoComplete="email" required value={form.email} onChange={update('email')} />
          </Field>

          {isSignup && (
            <Field label="Phone" htmlFor="phone" optional>
              <input id="phone" type="tel" autoComplete="tel" maxLength={20} value={form.phone} onChange={update('phone')} />
            </Field>
          )}

          <Field
            label="Password"
            htmlFor="password"
            hint={isSignup ? 'At least 8 characters.' : undefined}
          >
            <input
              id="password"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
              value={form.password}
              onChange={update('password')}
            />
          </Field>

          <Button type="submit" busy={busy} className="btn-block btn-lg">
            {isSignup ? 'Create account' : 'Log in'}
          </Button>

          <p className="login-switch">
            {isSignup ? 'Already have an account?' : 'New to HackGrid?'}{' '}
            <a href={otherHref}>{isSignup ? 'Log in' : 'Create an account'}</a>
          </p>
        </form>
      </section>
    </div>
  )
}

export default LoginPage
