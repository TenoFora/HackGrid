import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { setToken, setUnauthorizedHandler } from '../api/client'
import { useToast } from '../components/Toast'
import { readJSON, removeKey, writeJSON } from '../lib/storage'

const SESSION_KEY = 'hg.session'
const userKey = (userId) => `hg.user.${userId}`

// The API has no "list my X" endpoints yet, so the IDs a user creates
// (bookings, teams, profiles, events) are remembered on this device.
const EMPTY = {
  registrations: [],
  teams: [],
  organizers: [],
  colleges: [],
  events: [],
}

const AuthContext = createContext(null)

function loadSession() {
  const session = readJSON(SESSION_KEY, null)
  if (session?.token) setToken(session.token)
  return session?.token ? session : null
}

function parse(raw) {
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const notify = useToast()
  const [session, setSession] = useState(loadSession)
  const [data, setData] = useState(() =>
    session ? { ...EMPTY, ...readJSON(userKey(session.user.user_id), {}) } : EMPTY,
  )
  const [expired, setExpired] = useState(false)
  // The last JSON this tab wrote, so the storage listener can ignore its own echo.
  const lastWritten = useRef(null)

  const signIn = useCallback(({ user, token }) => {
    const next = { user, token }
    setToken(token)
    writeJSON(SESSION_KEY, next)
    setSession(next)
    setData({ ...EMPTY, ...readJSON(userKey(user.user_id), {}) })
    setExpired(false)
  }, [])

  const signOut = useCallback(() => {
    setToken(null)
    removeKey(SESSION_KEY)
    setSession(null)
    setData(EMPTY)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      signOut()
      setExpired(true)
      notify('Your session expired. Log in again to continue.', 'bad')
    })
  }, [signOut, notify])

  useEffect(() => {
    if (!session) return
    lastWritten.current = JSON.stringify(data)
    writeJSON(userKey(session.user.user_id), data)
  }, [data, session])

  // Keep several tabs in step. Without this, a tab holding stale data would
  // overwrite bookings made in another tab the next time it saved, and logging
  // out in one tab would leave the others signed in.
  useEffect(() => {
    function onStorage(event) {
      if (event.storageArea !== localStorage) return

      if (event.key === SESSION_KEY) {
        const next = parse(event.newValue)
        if (!next?.token) {
          setToken(null)
          setSession(null)
          setData(EMPTY)
        } else if (next.token !== session?.token) {
          setToken(next.token)
          setSession(next)
          setData({ ...EMPTY, ...readJSON(userKey(next.user.user_id), {}) })
          setExpired(false)
        }
        return
      }

      if (session && event.key === userKey(session.user.user_id)) {
        if (event.newValue === lastWritten.current) return
        setData({ ...EMPTY, ...parse(event.newValue) })
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [session])

  // upsert('teams', team, 'team_id') adds or merges a record by id.
  const upsert = useCallback((list, record, idKey) => {
    setData((prev) => {
      const id = String(record[idKey])
      const existing = prev[list].find((item) => String(item[idKey]) === id)
      const merged = existing ? { ...existing, ...record } : record
      return {
        ...prev,
        [list]: [merged, ...prev[list].filter((item) => String(item[idKey]) !== id)],
      }
    })
  }, [])

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      data,
      upsert,
      signIn,
      signOut,
      expired,
      clearExpired: () => setExpired(false),
    }),
    [session, data, upsert, signIn, signOut, expired],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
