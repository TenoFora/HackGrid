import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { api } from '../api/client'
import { readJSON, writeJSON } from './storage'

// Re-renders every `interval` ms. Used for hold countdowns.
export function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(id)
  }, [interval])
  return now
}

// Live capacity. The backend has no Socket.IO yet, so this polls the
// availability endpoint every 10s while the tab is visible.
export function useAvailability(eventId, interval = 10000) {
  const [state, setState] = useState({ data: null, error: null, updatedAt: null })

  const refresh = useCallback(async () => {
    try {
      const data = await api.availability(eventId)
      setState({ data, error: null, updatedAt: Date.now() })
    } catch (error) {
      setState((prev) => ({ ...prev, error: error.message }))
    }
  }, [eventId])

  useEffect(() => {
    // Syncing with an external system (the API); state is set after the fetch resolves.
    // eslint-disable-next-line react/set-state-in-effect
    refresh()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, interval)
    return () => clearInterval(id)
  }, [refresh, interval])

  return { ...state, refresh }
}

// Recently viewed events, shared across accounts on this device.
const RECENTS_KEY = 'hg.recent'
const listeners = new Set()
let recentsCache = readJSON(RECENTS_KEY, [])

export function addRecent(event) {
  const entry = { event_id: String(event.event_id), event_name: event.event_name }
  recentsCache = [entry, ...recentsCache.filter((e) => e.event_id !== entry.event_id)].slice(0, 6)
  writeJSON(RECENTS_KEY, recentsCache)
  listeners.forEach((listener) => listener())
}

export function useRecents() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => recentsCache,
  )
}

// Theme: 'system' | 'light' | 'dark', applied as <html data-theme>.
const THEME_KEY = 'hg.theme'

export function applyStoredTheme() {
  const theme = readJSON(THEME_KEY, 'system')
  if (theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
}

export function useTheme() {
  const [theme, setThemeState] = useState(() => readJSON(THEME_KEY, 'system'))
  const setTheme = useCallback((next) => {
    writeJSON(THEME_KEY, next)
    setThemeState(next)
    applyStoredTheme()
  }, [])
  return [theme, setTheme]
}
