// Thin wrapper around Malik's Express API (server/routes.js).
// In dev, Vite proxies /api to http://localhost:5000 (see vite.config.js).
// Set VITE_API_URL to point at a different backend origin.
const BASE = `${import.meta.env.VITE_API_URL || ''}/api`

// HTTP method override.
// Some firewalls, proxies and older clients only let GET and POST through. The
// workaround is to send the request as a POST and name the real verb in an
// X-HTTP-Method-Override header; a server-side middleware then treats it as
// PUT, PATCH or DELETE. This client does that automatically for those three verbs.
// (The server must opt in to honour the header; see the note in the PR.)
const OVERRIDDEN_METHODS = new Set(['PUT', 'PATCH', 'DELETE'])
export const METHOD_OVERRIDE_HEADER = 'X-HTTP-Method-Override'

let token = null
let onUnauthorized = () => {}

export function setToken(value) {
  token = value
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

export class ApiError extends Error {
  constructor(message, status, extra = {}) {
    super(message)
    this.status = status
    Object.assign(this, extra)
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const verb = method.toUpperCase()
  const wireMethod = OVERRIDDEN_METHODS.has(verb) ? 'POST' : verb

  const headers = {}
  // The server rejects POSTs without a JSON body, so always send one.
  const payload = wireMethod === 'POST' ? JSON.stringify(body ?? {}) : undefined
  if (payload) headers['Content-Type'] = 'application/json'
  if (wireMethod !== verb) headers[METHOD_OVERRIDE_HEADER] = verb
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(BASE + path, { method: wireMethod, headers, body: payload })
  } catch {
    throw new ApiError('The HackGrid API could not be reached.', 0, { unreachable: true })
  }

  const raw = await response.text().catch(() => '')
  let data = {}
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    // Not JSON: a proxy or gateway error page rather than the API's own response.
  }

  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized()
    // The API always answers errors with { error }. A 5xx without one means the
    // request never reached it (for example Vite's proxy when the API is down).
    const unreachable = response.status >= 500 && !data.error
    throw new ApiError(
      data.error || `The server answered with status ${response.status}.`,
      response.status,
      { unreachable },
    )
  }
  return data
}

const post = (path, body) => request(path, { method: 'POST', body })

export const api = {
  register: (body) => post('/auth/register', body),
  login: (body) => post('/auth/login', body),

  listEvents: ({ search, city } = {}) => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (city) params.set('city', city)
    const qs = params.toString()
    return request(`/events${qs ? `?${qs}` : ''}`)
  },
  availability: (eventId) => request(`/events/${eventId}/availability`),
  createEvent: (body) => post('/events', body),

  createOrganizer: (body) => post('/organizers', body),
  createCollege: (body) => post('/colleges', body),

  createTeam: (body) => post('/teams', body),
  addTeamMember: (teamId, userId) => post(`/teams/${teamId}/members`, { user_id: userId }),

  createRegistration: (body) => post('/registrations', body),
  cancelRegistration: (registrationId) => post(`/registrations/${registrationId}/cancel`),

  createPayment: (body) => post('/payments', body),
  createReview: (body) => post('/reviews', body),

  // Generic verbs, tunnelled through POST with the override header (see above).
  // The current API only uses GET and POST; these are ready for when it grows
  // PUT / PATCH / DELETE routes.
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path, body) => request(path, { method: 'DELETE', body }),
}

// Optional form fields: the API treats a missing field as "not provided"
// but rejects empty strings, so blank inputs are dropped.
export function optional(value) {
  const trimmed = typeof value === 'string' ? value.trim() : value
  return trimmed === '' || trimmed == null ? undefined : trimmed
}
