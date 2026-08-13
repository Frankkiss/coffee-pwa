export function requireDevelopmentFixture<T>(fixture: T | undefined, isDevelopment: boolean) {
  if (fixture !== undefined && !isDevelopment) {
    throw new Error('Backup fixtures are development-only')
  }

  return fixture
}
