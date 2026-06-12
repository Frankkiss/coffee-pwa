export function getAuthRedirectTo(origin: string, basePath: string) {
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`
  return new URL(normalizedBase, origin).toString()
}
