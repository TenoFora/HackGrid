const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
const dayFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric' })
const monthFmt = new Intl.DateTimeFormat('en-IN', { month: 'short' })

export function money(value) {
  const amount = Number(value)
  if (!amount) return 'Free'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: amount % 1 ? 2 : 0,
  }).format(amount)
}

export function dateTime(value) {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : dateTimeFmt.format(date)
}

export function dayMonth(value) {
  const date = new Date(value)
  return { day: dayFmt.format(date), month: monthFmt.format(date) }
}

export function isPast(value) {
  return value ? new Date(value).getTime() <= Date.now() : false
}

// "2026-12-01T10:00" (datetime-local) -> "2026-12-01 10:00:00" (MySQL DATETIME)
export function toMysqlDateTime(local) {
  if (!local) return ''
  const withSeconds = local.length === 16 ? `${local}:00` : local
  return withSeconds.replace('T', ' ')
}

export function countdown(ms) {
  if (ms <= 0) return '0:00'
  const total = Math.floor(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

export function greeting(name) {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const first = name?.trim().split(/\s+/)[0]
  return first ? `${part}, ${first}` : part
}

export function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function plural(count, word, many = `${word}s`) {
  return `${count} ${Number(count) === 1 ? word : many}`
}
