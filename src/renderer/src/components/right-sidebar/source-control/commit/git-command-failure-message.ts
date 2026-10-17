import { readIpcErrorDetail, readIpcErrorMessage } from '@/lib/ipc-error'

const COMMAND_FAILED_PREFIX = /^Command failed:/
const GIT_REASON_LINE = /^(?:fatal|error):\s*/i

/**
 * The line a user can act on. A failed git process reports "Command failed: git add -- …" first and
 * git's own reason (e.g. the index.lock "File exists") on the following stderr lines.
 */
export function readGitCommandFailureMessage(error: unknown): string | undefined {
  const firstLine = readIpcErrorMessage(error)
  if (!firstLine || !COMMAND_FAILED_PREFIX.test(firstLine)) {
    return firstLine
  }
  const reasonLines = (readIpcErrorDetail(error) ?? '')
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const reason = reasonLines.find((line) => GIT_REASON_LINE.test(line)) ?? reasonLines[0]
  return reason ?? firstLine
}
