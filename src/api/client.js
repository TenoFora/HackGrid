// Thin wrapper around Malik's Express API (server/routes.js).
// In dev, Vite proxies /api to http://localhost:5000 (see vite.config.js).
// Set VITE_API_URL to point at a different backend origin.
const BASE = `${import.meta.env.VITE_API_URL || ''}/api`

let token = null
let onUnauthorized = () => {}

export function setToken(value) {
  token = value
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = {}
  // The server rejects POSTs without a JSON body, so always send one.
  const payload = method === 'POST' ? JSON.stringify(body ?? {}) : undefined
  if (payload) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(BASE + path, { method, headers, body: payload })
  } catch {
    throw new ApiError('Could not reach the HackGrid API. Is it running (npm run api)?', 0)
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized()
    throw new ApiError(data.error || `Request failed with status ${response.status}`, response.status)
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
}

// Optional form fields: the API treats a missing field as "not provided"
// but rejects empty strings, so blank inputs are dropped.
export function optional(value) {
  const trimmed = typeof value === 'string' ? value.trim() : value
  return trimmed === '' || trimmed == null ? undefined : trimmed
}
