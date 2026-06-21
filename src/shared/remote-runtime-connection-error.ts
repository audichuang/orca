export function formatRemoteRuntimeConnectFailureMessage(
  endpoint: string,
  cause?: unknown
): string {
  const base = `Could not connect to the remote Orca runtime at ${formatEndpoint(endpoint)}.`
  const detail = formatTransportErrorDetail(cause)
  return detail ? `${base} ${detail}` : base
}

function formatEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    const formatted = url.toString()
    return url.pathname === '/' ? formatted.replace(/\/$/, '') : formatted
  } catch {
    return endpoint
  }
}

function formatTransportErrorDetail(cause: unknown): string {
  const message = getErrorMessage(cause)
  const code = getErrorCode(cause)
  if (message && code && !message.includes(code)) {
    return `Transport error (${code}): ${message}.`
  }
  if (message) {
    return `Transport error: ${message}.`
  }
  if (code) {
    return `Transport error: ${code}.`
  }
  return ''
}

function getErrorMessage(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : ''
  return raw.trim().replace(/\.+$/, '')
}

function getErrorCode(cause: unknown): string {
  if (!cause || typeof cause !== 'object') {
    return ''
  }
  const code = (cause as { code?: unknown }).code
  return typeof code === 'string' ? code.trim() : ''
}
