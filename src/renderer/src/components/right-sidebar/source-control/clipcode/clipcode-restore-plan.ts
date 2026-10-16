// Behavioral port of ClipCodeVSCode pathResolver/restoreBase, reduced to the single-root case.
import type { ParsedEntry } from './clipcode-clipboard-format'

export type ClipcodeRestoreBase =
  | { kind: 'strip'; segment: string }
  | { kind: 'add'; prefix: string }

export type ClipcodeRestoreBaseSuggestion = { base: ClipcodeRestoreBase; label: string }

export type ClipcodeRestoreSkipReason =
  | 'UNSAFE_PATH'
  | 'PROTECTED_GIT'
  | 'SYMLINK_IN_PATH'
  | 'OUTSIDE_ROOT'
  | 'CONTENT_SKIPPED'

export type ClipcodeRestorePlan = {
  writes: { relativePath: string; content: string }[]
  deletes: { relativePath: string }[]
  skipped: { rawPath: string; reason: ClipcodeRestoreSkipReason }[]
}

function normalizeSystemPath(value: string): string {
  const normalized = value.trim().replaceAll('\\', '/').replace(/\/+/g, '/')
  if (normalized === '/' || /^[A-Za-z]:\/$/.test(normalized)) {
    return normalized
  }
  return normalized.replace(/\/+$/g, '')
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:\//.test(value)
}

function isWindowsStylePath(value: string): boolean {
  return /^[A-Za-z]:(\/.*)?$/.test(value)
}

function pathKey(value: string): string {
  const normalized = normalizeSystemPath(value)
  return isWindowsStylePath(normalized) ? normalized.toLowerCase() : normalized
}

/** Returns a clean '/'-joined relative path, or undefined when it is empty, absolute or can escape the root. */
export function sanitizeRelativePath(value: string): string | undefined {
  const normalized = value.trim().replaceAll('\\', '/').replace(/\/+/g, '/').replace(/^\/+/, '')
  if (!normalized || isAbsolutePath(normalized)) {
    return undefined
  }
  const segments = normalized.split('/').filter((segment) => segment && segment !== '.')
  if (segments.length === 0) {
    return undefined
  }
  // Why: a restored `.git/...` entry could plant hooks or rewrite repo config, so it is never a valid target.
  if (
    segments.some(
      (segment) => segment === '..' || segment.toLowerCase() === '.git' || /[<>:"|?*]/.test(segment)
    )
  ) {
    return undefined
  }
  return segments.join('/')
}

function relativizePath(absolutePath: string, rootPath: string): string | undefined {
  const absolute = normalizeSystemPath(absolutePath)
  const root = normalizeSystemPath(rootPath)
  if (!pathKey(absolute).startsWith(`${pathKey(root)}/`)) {
    return undefined
  }
  return sanitizeRelativePath(absolute.slice(root.length + 1))
}

// Clipboards from another machine carry that machine's absolute paths; align on the root folder name.
function crossMachineSuffixRelativePath(
  absolutePath: string,
  rootPath: string
): string | undefined {
  const rootName = normalizeSystemPath(rootPath).split('/').pop()
  if (!rootName) {
    return undefined
  }
  const windowsStyle = isWindowsStylePath(absolutePath) || isWindowsStylePath(rootPath)
  const segments = normalizeSystemPath(absolutePath)
    .replace(/^[A-Za-z]:\//, '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
  const matches = new Set<string>()
  for (let index = 0; index < segments.length - 1; index++) {
    const same = windowsStyle
      ? segments[index].toLowerCase() === rootName.toLowerCase()
      : segments[index] === rootName
    if (!same) {
      continue
    }
    const relativePath = sanitizeRelativePath(segments.slice(index + 1).join('/'))
    if (relativePath) {
      matches.add(relativePath)
    }
  }
  // Ambiguous suffixes must not guess a destination.
  return matches.size === 1 ? [...matches][0] : undefined
}

export function applyRestoreBase(base: ClipcodeRestoreBase, relativePath: string): string {
  if (base.kind === 'add') {
    return `${base.prefix}/${relativePath}`
  }
  const slash = relativePath.indexOf('/')
  return slash !== -1 && relativePath.slice(0, slash) === base.segment
    ? relativePath.slice(slash + 1)
    : relativePath
}

/**
 * Decides whether the clipboard paths are off by one folder level. Only the deterministic
 * `clipcode-root` metadata path is ported; without that line nothing is guessed.
 */
export function suggestRestoreBase(args: {
  rootPath: string
  relativePaths: readonly string[]
  sourceRoot: string | undefined
  /** Whether `<rootPath>/<sourceRoot>` is an existing directory. */
  sourceRootIsDirectory: boolean
}): ClipcodeRestoreBaseSuggestion | undefined {
  const { rootPath, sourceRoot } = args
  const rels = args.relativePaths.filter(
    (path) => path && !isAbsolutePath(normalizeSystemPath(path))
  )
  if (!sourceRoot || rels.length === 0) {
    return undefined
  }
  const targetName = normalizeSystemPath(rootPath).split('/').pop() ?? ''
  if (targetName === sourceRoot) {
    return undefined
  }
  const nested = rels.filter((path) => path.includes('/'))
  const firstSegments = new Set(nested.map((path) => path.slice(0, path.indexOf('/'))))
  if (nested.length > 0 && firstSegments.size === 1 && [...firstSegments][0] === targetName) {
    return { base: { kind: 'strip', segment: targetName }, label: `${targetName}/` }
  }
  if (args.sourceRootIsDirectory) {
    return { base: { kind: 'add', prefix: sourceRoot }, label: `${sourceRoot}/` }
  }
  return undefined
}

// Copy writes this placeholder body for files it could not include; it is not file content.
const SKIP_PLACEHOLDER = /^\/\/ File skipped: [^\r\n]*$/

export function planClipcodeRestore(args: {
  rootPath: string
  entries: readonly ParsedEntry[]
  base?: ClipcodeRestoreBase
}): ClipcodeRestorePlan {
  const plan: ClipcodeRestorePlan = { writes: [], deletes: [], skipped: [] }
  // Why: two entries (or a strip-base collision) can resolve to one path; the last one wins so the preview and the write agree.
  const finalPaths = new Map<string, { relativePath: string; entry: ParsedEntry }>()
  for (const entry of args.entries) {
    const rawPath = entry.path
    const normalized = normalizeSystemPath(rawPath)
    let relativePath: string | undefined
    if (isAbsolutePath(normalized)) {
      relativePath =
        relativizePath(normalized, args.rootPath) ??
        crossMachineSuffixRelativePath(normalized, args.rootPath)
      if (!relativePath) {
        plan.skipped.push({ rawPath, reason: 'OUTSIDE_ROOT' })
        continue
      }
    } else {
      const sanitized = sanitizeRelativePath(normalized)
      relativePath =
        sanitized && args.base
          ? sanitizeRelativePath(applyRestoreBase(args.base, sanitized))
          : sanitized
      if (!relativePath) {
        const touchesGit = normalized.split('/').some((segment) => segment.toLowerCase() === '.git')
        plan.skipped.push({ rawPath, reason: touchesGit ? 'PROTECTED_GIT' : 'UNSAFE_PATH' })
        continue
      }
    }
    finalPaths.delete(relativePath)
    finalPaths.set(relativePath, { relativePath, entry })
  }
  for (const { relativePath, entry } of finalPaths.values()) {
    if (entry.changeTypes.has('DELETED')) {
      plan.deletes.push({ relativePath })
    } else if (SKIP_PLACEHOLDER.test(entry.content.trim())) {
      plan.skipped.push({ rawPath: relativePath, reason: 'CONTENT_SKIPPED' })
    } else {
      // MOVED only carries the new path; the old location is never touched.
      plan.writes.push({ relativePath, content: entry.content })
    }
  }
  return plan
}

/** 'blocked': the path crosses a symlink or could not be verified on the host, so it is never touched. */
export type ClipcodeTargetState = 'file' | 'directory' | 'missing' | 'blocked'

export type ClipcodeRestorePreview = {
  create: { relativePath: string; content: string }[]
  overwrite: { relativePath: string; content: string }[]
  delete: { relativePath: string }[]
  skipped: { path: string; reason: ClipcodeRestoreSkipReason | 'ALREADY_ABSENT' | 'IS_DIRECTORY' }[]
}

/** Classifies a plan against what already exists; a delete only runs when the target is a file. */
export function previewClipcodeRestore(
  plan: ClipcodeRestorePlan,
  stateOf: (relativePath: string) => ClipcodeTargetState
): ClipcodeRestorePreview {
  const preview: ClipcodeRestorePreview = { create: [], overwrite: [], delete: [], skipped: [] }
  for (const skipped of plan.skipped) {
    preview.skipped.push({ path: skipped.rawPath, reason: skipped.reason })
  }
  for (const write of plan.writes) {
    const state = stateOf(write.relativePath)
    if (state === 'blocked') {
      preview.skipped.push({ path: write.relativePath, reason: 'SYMLINK_IN_PATH' })
    } else if (state === 'directory') {
      preview.skipped.push({ path: write.relativePath, reason: 'IS_DIRECTORY' })
    } else {
      preview[state === 'file' ? 'overwrite' : 'create'].push(write)
    }
  }
  for (const del of plan.deletes) {
    const state = stateOf(del.relativePath)
    if (state === 'file') {
      preview.delete.push(del)
    } else {
      preview.skipped.push({
        path: del.relativePath,
        reason:
          state === 'blocked'
            ? 'SYMLINK_IN_PATH'
            : state === 'directory'
              ? 'IS_DIRECTORY'
              : 'ALREADY_ABSENT'
      })
    }
  }
  return preview
}
