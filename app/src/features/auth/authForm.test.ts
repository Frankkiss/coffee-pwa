import { describe, expect, it } from 'vitest'
import {
  validateEmail,
  validateLoginForm,
  validateNewPasswordForm,
  validateResetRequestForm,
  validateSignupForm,
} from './authForm'

describe('auth form validation', () => {
  it('validates email shape', () => {
    expect(validateEmail('  user@example.com ')).toBeNull()
    expect(validateEmail('bad-email')).toBe('请输入有效邮箱。')
  })

  it('requires password for password login', () => {
    expect(validateLoginForm('user@example.com', '')).toBe('请输入密码。')
    expect(validateLoginForm('user@example.com', 'password123')).toBeNull()
  })

  it('requires a strong matching password for signup', () => {
    expect(validateSignupForm('user@example.com', 'short', 'short')).toBe(
      '密码至少需要 8 位。',
    )
    expect(validateSignupForm('user@example.com', 'password123', 'password456')).toBe(
      '两次输入的密码不一致。',
    )
    expect(validateSignupForm('user@example.com', 'password123', 'password123')).toBeNull()
  })

  it('validates password reset request email', () => {
    expect(validateResetRequestForm('bad')).toBe('请输入有效邮箱。')
    expect(validateResetRequestForm('user@example.com')).toBeNull()
  })

  it('validates new password after recovery', () => {
    expect(validateNewPasswordForm('password123', 'password456')).toBe(
      '两次输入的密码不一致。',
    )
    expect(validateNewPasswordForm('password123', 'password123')).toBeNull()
  })
})
