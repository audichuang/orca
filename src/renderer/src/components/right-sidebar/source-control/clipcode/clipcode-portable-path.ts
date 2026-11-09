// Fork-only: OpenIDEA `is_exportable_relative_path` (crates/ide-clip/src/paths.rs), the name rule every ClipCode restores alike.
import { asciiTrim } from './clipcode-clipboard-format'

/** False for `..`, Windows-illegal `<>:"|?*`, `\` and control characters U+0000-U+001F. */
export function isClipcodePortablePathSegment(segment: string): boolean {
  if (segment === '..' || /[<>:"|?*\\]/.test(segment)) {
    return false
  }
  for (let index = 0; index < segment.length; index++) {
    if (segment.charCodeAt(index) < 0x20) {
      return false
    }
  }
  return true
}

/** True when a `/`-joined relative path restores as itself on every platform. */
export function isClipcodePortableRelativePath(path: string): boolean {
  // Why isWellFormed: a lone surrogate is a Windows name that is not valid UTF-16, so it has no UTF-8 form.
  if (!path.isWellFormed() || asciiTrim(path) !== path) {
    return false
  }
  return path
    .split('/')
    .every((segment) => segment !== '' && segment !== '.' && isClipcodePortablePathSegment(segment))
}
