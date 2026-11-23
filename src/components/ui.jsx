import { Children, cloneElement, isValidElement } from 'react'

// Small shared building blocks. Radius rule: controls 10px, panels 16px, status pills full.

const FORM_CONTROLS = new Set(['input', 'select', 'textarea'])

// Wires the label, hint and error to the control for screen readers:
// aria-invalid and aria-describedby are added to a direct input/select/textarea child.
export function Field({ label, htmlFor, hint, error, optional, children }) {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined
  const control = Children.map(children, (child) =>
    isValidElement(child) && FORM_CONTROLS.has(child.type)
      ? cloneElement(child, { 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })
      : child,
  )

  return (
    <div className="field">
      <label htmlFor={htmlFor}>
        {label}
        {optional && <span className="field-optional">Optional</span>}
      </label>
      {control}
      {hint && !error && (
        <p className="field-hint" id={`${htmlFor}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${htmlFor}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

// `error` is a string or an { message, hint } object from explainError().
export function FormError({ error }) {
  if (!error) return null
  const { message, hint } = typeof error === 'string' ? { message: error } : error
  return (
    <div className="form-error" role="alert">
      <strong>{message}</strong>
      {hint && <span className="form-error-hint">{hint}</span>}
    </div>
  )
}

export function Button({ variant = 'primary', busy, children, className = '', ...props }) {
  return (
    <button
      className={`btn btn-${variant} ${className}`}
      disabled={busy || props.disabled}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? <span className="btn-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

// A group of toggle buttons (one active at a time). aria-pressed keeps it simple
// for keyboards: every button is a normal tab stop, so no arrow-key handling is needed.
export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={value === option.value ? 'is-active' : ''}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

const STATUS_TONE = {
  CONFIRMED: 'good',
  PUBLISHED: 'good',
  SUCCESS: 'good',
  HELD: 'warn',
  PENDING: 'warn',
  AWAITING: 'warn',
  DRAFT: 'neutral',
  CANCELLED: 'neutral',
  EXPIRED: 'bad',
  FAILED: 'bad',
}

const STATUS_LABEL = { AWAITING: 'Awaiting confirmation' }

// "CONFIRMED" -> "Confirmed". Only the first letter is capitalised.
const sentenceCase = (word) => word.charAt(0) + word.slice(1).toLowerCase()

export function StatusPill({ status, children }) {
  const tone = STATUS_TONE[status] ?? 'neutral'
  return <span className={`pill pill-${tone}`}>{children ?? STATUS_LABEL[status] ?? sentenceCase(status)}</span>
}

export function CapacityMeter({ remaining, capacity, compact }) {
  const left = Number(remaining)
  const total = Number(capacity) || 1
  const ratio = Math.max(0, Math.min(1, left / total))
  const tone = left === 0 ? 'full' : ratio <= 0.15 ? 'low' : 'ok'
  return (
    <div className={`meter meter-${tone} ${compact ? 'meter-compact' : ''}`}>
      <div className="meter-label">
        <span className="mono">{left === 0 ? 'Full' : `${left} left`}</span>
        {!compact && <span className="muted mono">of {total}</span>}
      </div>
      <div className="meter-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${1 - ratio})` }} />
      </div>
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function SkeletonRows({ count = 4 }) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-row">
          <span className="skeleton skeleton-date" />
          <span className="skeleton-lines">
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-sub" />
          </span>
        </div>
      ))}
    </div>
  )
}

export function PageHeader({ title, children }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {children && <p className="page-lede">{children}</p>}
    </header>
  )
}
