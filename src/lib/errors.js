// Turns API failures into plain language: what happened, and what to do next.
//
// The server's own messages are kept when they are already clear. The vague ones
// ("A record with the same unique value already exists") are replaced with an
// explanation that depends on what the user was doing (the `context`).

const DUP = /same unique value already exists/i
const REF = /referenced record is invalid|constraint was not met/i

const has = (pattern) => (error) => pattern.test(error.message)

// First matching rule wins. `ctx` is a context name, a list of them, or '*' for any.
const RULES = [
  {
    ctx: '*',
    when: (e) => e.unreachable,
    message: "Can't reach the HackGrid server.",
    hint: 'Check that the API is running (npm run api) and that you are online, then try again.',
  },

  // Auth
  {
    ctx: 'login',
    when: (e) => e.status === 401,
    message: "That email and password don't match an account.",
    hint: "Check for typos, or create an account if you're new.",
  },
  {
    ctx: 'signup',
    when: (e) => DUP.test(e.message),
    message: 'An account with this email already exists.',
    hint: 'Log in instead, or sign up with a different email.',
  },

  // Teams
  {
    ctx: 'addMember',
    when: (e) => e.status === 404 && /user/i.test(e.message),
    message: 'No active account has that user ID.',
    hint: 'Your teammate needs an account first. They can copy their ID from the Teams page.',
  },
  {
    ctx: 'addMember',
    when: (e) => DUP.test(e.message),
    message: 'That person is already on this team.',
    hint: 'Each person can only be added once.',
  },
  {
    ctx: 'addMember',
    when: (e) => e.status === 403,
    message: 'Only the team leader can add members.',
    hint: 'Log in with the account that created this team.',
  },
  {
    ctx: 'createTeam',
    when: (e) => DUP.test(e.message),
    message: 'You already have a team with that name.',
    hint: 'Pick a different team name.',
  },

  // Registration
  {
    ctx: 'register',
    when: (e) => DUP.test(e.message),
    message: 'You already have a registration on file for this event.',
    hint: 'If you cancelled or a hold expired earlier, that older record can still block a new one. Ask the organizer to clear it.',
  },
  {
    ctx: 'register',
    when: has(/team size must be/i),
    hint: 'Add or remove teammates on the Teams page, then try again.',
  },
  {
    ctx: 'register',
    when: has(/not enough capacity/i),
    message: 'Someone took the last places before you.',
    hint: 'Check the live count, then try again with fewer people or pick another event.',
  },
  {
    ctx: 'register',
    when: has(/registration is closed/i),
    message: 'Registration has closed for this event.',
    hint: 'The deadline has passed, so no new registrations are accepted.',
  },
  {
    ctx: 'register',
    when: has(/only the team leader/i),
    hint: 'Ask your team leader to register, or register on your own.',
  },

  // Payment and cancellation
  {
    ctx: 'pay',
    when: has(/hold is no longer active/i),
    message: 'Your 10 minute hold has ended.',
    hint: 'Register again if places are still available.',
  },
  {
    ctx: 'pay',
    when: has(/do not require a payment/i),
    message: 'This booking is free, so no payment is needed.',
    hint: 'Nothing more to do.',
  },
  {
    ctx: 'pay',
    when: (e) => e.status === 403,
    message: "You can't pay for someone else's registration.",
    hint: 'Log in with the account that made this booking.',
  },
  {
    ctx: 'cancel',
    when: has(/refund workflow/i),
    message: "Confirmed bookings can't be cancelled online.",
    hint: 'Contact the organizer to ask for a refund.',
  },

  // Reviews
  {
    ctx: 'review',
    when: has(/completed events/i),
    message: 'You can review an event only after it is marked completed.',
    hint: 'Come back once the organizer has closed the event.',
  },
  {
    ctx: 'review',
    when: has(/confirmed event participant/i),
    message: 'Only confirmed participants can review this event.',
    hint: 'Your registration needs to be confirmed (free, or paid) first.',
  },
  {
    ctx: 'review',
    when: (e) => DUP.test(e.message),
    message: "You've already reviewed this event.",
    hint: 'Each person can leave one review per event.',
  },

  // Hosting
  {
    ctx: 'createEvent',
    when: (e) => REF.test(e.message),
    message: "One of the IDs doesn't exist.",
    hint: 'Check the venue ID, and that the organizer or college was created under your account.',
  },
  {
    ctx: 'createEvent',
    when: (e) => e.status === 403,
    hint: 'Use a hosting profile you created under this account, or create one on the Organizer or College tab.',
  },
  {
    ctx: ['createOrganizer', 'createCollege'],
    when: (e) => DUP.test(e.message),
    message: 'That name or email is already registered.',
    hint: 'Use a different one, or check whether you already created it.',
  },
]

// Used when no rule matches: keep the server's wording, add a next step by status.
function fallback(error) {
  if (DUP.test(error.message)) {
    return { message: 'That already exists.', hint: 'Change the details you entered, or use the existing one.' }
  }
  if (REF.test(error.message)) {
    return {
      message: "Something you entered points to a record that doesn't exist.",
      hint: 'Check any ID fields and try again.',
    }
  }
  if (error.status === 401) {
    return { message: 'Your session has ended.', hint: 'Log in again to continue.' }
  }
  if (error.status === 403) {
    return { message: error.message, hint: "Your account isn't allowed to do this." }
  }
  if (error.status === 404) {
    return { message: error.message, hint: 'It may have been removed. Go back and refresh the page.' }
  }
  if (error.status === 409) {
    return { message: error.message, hint: 'This conflicts with what is already on the server. Refresh and try again.' }
  }
  if (error.status === 429) {
    return { message: 'Too many requests.', hint: 'Wait a few seconds and try again.' }
  }
  if (error.status >= 500) {
    return {
      message: 'The server hit a problem.',
      hint: 'Wait a moment and try again. If it keeps happening, tell the backend team what you were doing.',
    }
  }
  return { message: error.message || 'Something went wrong.', hint: 'Check what you entered and try again.' }
}

export function explainError(error, context) {
  const err = error ?? {}
  const rule = RULES.find((r) => {
    const contexts = Array.isArray(r.ctx) ? r.ctx : [r.ctx]
    return (contexts.includes('*') || contexts.includes(context)) && r.when(err)
  })
  if (!rule) return fallback(err)
  const base = fallback(err)
  return { message: rule.message ?? err.message ?? base.message, hint: rule.hint ?? base.hint }
}

// One string, for toasts and single-line spots.
export function errorText(error, context) {
  const { message, hint } = explainError(error, context)
  return hint ? `${message} ${hint}` : message
}
