import { useEffect, useState } from 'react'

// Minimal hash router so the app needs no extra dependency.
// URLs look like  #/event/12  or  #/login?next=/teams
function parseHash() {
  const raw = window.location.hash.slice(1) || '/'
  const [path, search = ''] = raw.split('?')
  return { path: path || '/', query: new URLSearchParams(search) }
}

export function useHashRoute() {
  const [route, setRoute] = useState(parseHash)
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(to) {
  window.location.hash = to
}

// matchPath('/event/:id', '/event/7') -> { id: '7' }
export function matchPath(pattern, path) {
  const a = pattern.split('/')
  const b = path.split('/')
  if (a.length !== b.length) return null
  const params = {}
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i])
    else if (a[i] !== b[i]) return null
  }
  return params
}
