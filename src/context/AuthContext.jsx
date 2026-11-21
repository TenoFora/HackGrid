import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { setToken, setUnauthorizedHandler } from '../api/client'
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

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession)
  const [data, setData] = useState(() =>
    session ? { ...EMPTY, ...readJSON(userKey(session.user.user_id), {}) } : EMPTY,
  )
  const [expired, setExpired] = useState(false)

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
    })
  }, [signOut])

  useEffect(() => {
    if (session) writeJSON(userKey(session.user.user_id), data)
  }, [data, session])

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
