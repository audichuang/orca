#!/usr/bin/env node
// PreToolUse hook: block Bash commands where zsh would read `$var:x` as a history modifier.
// Why: agents on macOS (zsh) kept writing `git show $rev:path`, which silently becomes `<rev>ath`.
import { readFileSync } from 'node:fs'

export function findColonModifierUses(command) {
  const lines = command.split('\n')
  const kept = []
  let heredocEnd = null
  for (const line of lines) {
    if (heredocEnd !== null) {
      if (line.trim() === heredocEnd) {
        heredocEnd = null
      }
      continue
    }
    kept.push(line)
    // Only quoted delimiters stop expansion; unquoted heredoc bodies still expand $var:x.
    const heredoc = /<<-?\s*(['"])([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line)
    if (heredoc) {
      heredocEnd = heredoc[2]
    }
  }
  const unquoted = kept.join('\n').replace(/'[^']*'/g, "''")
  const pattern = /(^|[^\\$])(\$(?:[A-Za-z_][A-Za-z0-9_]*|[0-9])):[A-Za-z]/g
  return [...unquoted.matchAll(pattern)].map((match) => match[2])
}

function main() {
  if (process.platform !== 'darwin') {
    return
  }
  let command = ''
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'))
    command = input?.tool_input?.command ?? ''
  } catch {
    return
  }
  const uses = findColonModifierUses(command)
  if (uses.length === 0) {
    return
  }
  const names = [...new Set(uses)].join(', ')
  process.stderr.write(
    `zsh reads ${names} followed by ":<letter>" as a modifier (e.g. $rev:config -> <rev>onfig). ` +
      `Write \${name}: instead, e.g. git show "\${rev}:path".\n`
  )
  process.exit(2)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
