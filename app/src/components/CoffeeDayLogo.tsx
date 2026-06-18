import coffeeDayLogoC from '../assets/coffee-day-logo-c.jpg'
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
      <img className="coffee-day-logo__image" src={coffeeDayLogoC} alt="" aria-hidden="true" />
      {variant === 'mark' ? null : (
        <span className="coffee-day-logo__text">
          <strong id={headingId}>{title}</strong>
          <small>{subtitle}</small>
        </span>
      )}
    </div>
  )
}
