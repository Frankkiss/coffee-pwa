import './coffeeDayLogo.css'

type CoffeeDayLogoProps = {
  headingId?: string
  subtitle?: string
  title?: string
  variant?: 'login' | 'hero' | 'mark'
}

export function CoffeeDayLogo({
  headingId,
  subtitle = 'Coffee Day',
  title = '咖Day',
  variant = 'mark',
}: CoffeeDayLogoProps) {
  return (
    <div className={`coffee-day-logo coffee-day-logo--${variant}`} aria-label="咖Day Coffee Day">
      <span className="coffee-day-logo__cup" aria-hidden="true">
        <svg viewBox="0 0 96 96" role="img">
          <path className="coffee-day-logo__steam coffee-day-logo__steam--left" d="M34 19c-6 6 5 9-1 16" />
          <path className="coffee-day-logo__steam coffee-day-logo__steam--right" d="M54 15c-7 7 6 11-2 19" />
          <path
            className="coffee-day-logo__saucer"
            d="M23 74c5 7 43 7 51 0 2-2 1-6-2-6H25c-4 0-5 4-2 6Z"
          />
          <path
            className="coffee-day-logo__body"
            d="M23 38c7-4 37-4 44 0-1 24-8 34-22 34S24 62 23 38Z"
          />
          <path
            className="coffee-day-logo__handle"
            d="M66 43h5c9 0 11 14 2 18l-9 4"
          />
          <path className="coffee-day-logo__coffee" d="M29 40c7 6 24 6 32 0" />
          <circle className="coffee-day-logo__eye" cx="39" cy="53" r="2.6" />
          <circle className="coffee-day-logo__eye" cx="53" cy="53" r="2.6" />
          <path className="coffee-day-logo__smile" d="M40 59.5c4 4 10 4 14 0" />
        </svg>
      </span>
      {variant === 'mark' ? null : (
        <span className="coffee-day-logo__text">
          <strong id={headingId}>{title}</strong>
          <small>{subtitle}</small>
        </span>
      )}
    </div>
  )
}
