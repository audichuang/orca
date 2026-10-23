import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Independent git/disk oracle for the folder multi-repo e2e spec; no app code involved.
export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}
export function gitRaw(cwd: string, ...args: string[]): Buffer {
  return execFileSync('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 })
}

export type StatusEntry = { area: 'staged' | 'unstaged' | 'untracked'; code: string; path: string }

// Independent reader of `git status` (no app code involved).
export function readStatus(repo: string): StatusEntry[] {
  const out = git(repo, 'status', '--porcelain=v1', '-z', '--untracked-files=all')
  const parts = out.split('\0').filter((p) => p.length > 0)
  const entries: StatusEntry[] = []
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i]
    const x = rec[0]
    const y = rec[1]
    const p = rec.slice(3)
    if (x === 'R' || x === 'C') {
      i++ // original path follows
    }
    if (x === '?' && y === '?') {
      entries.push({ area: 'untracked', code: '?', path: p })
      continue
    }
    if (x !== ' ') {
      entries.push({ area: 'staged', code: x, path: p })
    }
    if (y !== ' ') {
      entries.push({ area: 'unstaged', code: y, path: p })
    }
  }
  return entries
}

export type ExpectedFile = { repoDir: string; repoAbs: string; entry: StatusEntry }
export const LABEL: Record<string, string> = {
  A: 'NEW',
  '?': 'NEW',
  D: 'DELETED',
  R: 'MOVED',
  M: 'MODIFIED',
  C: 'NEW'
}

export function isBinary(buf: Buffer): boolean {
  return buf.includes(0)
}

// Expected Snipcode payload computed from git + disk only.
export function expectedPayload(args: {
  rootName: string
  files: ExpectedFile[]
  forceIndexForStaged: boolean
}): string {
  const seen = new Set<string>()
  const blocks: { header: string; body: string; deleted: boolean }[] = []
  let usedIndex = false
  for (const f of args.files) {
    const rel = `${f.repoDir}/${f.entry.path}`
    if (seen.has(rel)) {
      continue
    }
    let body: Buffer
    const label = LABEL[f.entry.code]
    if (f.entry.code === 'D') {
      body = gitRaw(f.repoAbs, 'show', `HEAD:${f.entry.path}`)
    } else if (f.entry.area === 'staged' && args.forceIndexForStaged) {
      body = gitRaw(f.repoAbs, 'show', `:${f.entry.path}`)
      usedIndex = true
    } else {
      body = readFileSync(path.join(f.repoAbs, f.entry.path))
    }
    if (isBinary(body)) {
      continue
    }
    seen.add(rel)
    blocks.push({
      header: `// file: [${label}] ${rel}`,
      body: body.toString('utf8'),
      deleted: label === 'DELETED'
    })
  }
  // Snipcode: git spacing applies when index content was used or any file is DELETED.
  const gitSpacing = usedIndex || blocks.some((b) => b.deleted)
  const lines = [`// clipcode-root: ${args.rootName}`]
  if (!gitSpacing) {
    lines.push('')
  }
  for (const b of blocks) {
    lines.push(b.header, b.body, '')
  }
  if (!gitSpacing) {
    lines.push('')
  }
  return lines.join('\n')
}

export function splitBlocks(payload: string): string[] {
  return payload.split(/\n(?=\/\/ file: \[)/)
}

export const changedLines = (repo: string, staged: boolean, file: string) => {
  const out = git(repo, 'diff', ...(staged ? ['--cached'] : []), '-U0', '--', file)
  const added: string[] = []
  const removed: string[] = []
  for (const l of out.split('\n')) {
    if (l.startsWith('+') && !l.startsWith('+++')) {
      added.push(l.slice(1))
    } else if (l.startsWith('-') && !l.startsWith('---')) {
      removed.push(l.slice(1))
    }
  }
  return { added, removed }
}
export const statsLine = (payload: string) => {
  const chars = payload.length
  const lines = payload === '' ? 0 : payload.split('\n').length
  const wordsArr = payload.split(/[ \t\r\n\f\v]+/).filter(Boolean)
  const tokens = wordsArr.length + (payload.match(/[;,(){}[\]]/g)?.length ?? 0)
  const f = (n: number) => n.toLocaleString('en-US')
  // Same order as the copied toast's size line: tokens lead, then lines, chars, words.
  return `~${f(tokens)} tokens · ${f(lines)} lines · ${f(chars)} chars · ${f(wordsArr.length)} words`
}
