// Small shared building blocks. Radius rule: controls 10px, panels 16px, pills full.

export function Field({ label, htmlFor, hint, error, optional, children }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>
        {label}
        {optional && <span className="field-optional">Optional</span>}
      </label>
      {children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}

export function FormError({ message }) {
  if (!message) return null
  return (
    <div className="form-error" role="alert">
      {message}
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

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
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
  DRAFT: 'neutral',
  CANCELLED: 'neutral',
  EXPIRED: 'bad',
  FAILED: 'bad',
}

export function StatusPill({ status, children }) {
  const tone = STATUS_TONE[status] ?? 'neutral'
  return <span className={`pill pill-${tone}`}>{children ?? status.toLowerCase()}</span>
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
