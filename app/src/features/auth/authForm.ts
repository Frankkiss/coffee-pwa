const minPasswordLength = 8

export function validateEmail(email: string) {
  const normalizedEmail = email.trim()

  if (!normalizedEmail) {
    return '请输入邮箱。'
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return '请输入有效邮箱。'
  }

  return null
}

export function validateLoginForm(email: string, password: string) {
  const emailError = validateEmail(email)

  if (emailError) {
    return emailError
  }

  if (!password) {
    return '请输入密码。'
  }

  return null
}

export function validateSignupForm(
  email: string,
  password: string,
  confirmPassword: string,
) {
  const loginError = validateLoginForm(email, password)

  if (loginError) {
    return loginError
  }

  const passwordError = validateNewPasswordForm(password, confirmPassword)

  if (passwordError) {
    return passwordError
  }

  return null
}

export function validateResetRequestForm(email: string) {
  return validateEmail(email)
}

export function validateNewPasswordForm(
  password: string,
  confirmPassword: string,
) {
  if (!password) {
    return '请输入密码。'
  }

  if (password.length < minPasswordLength) {
    return `密码至少需要 ${minPasswordLength} 位。`
  }

  if (password !== confirmPassword) {
    return '两次输入的密码不一致。'
  }

  return null
}
