// Fork check: every upstream symbol pinned in config/fork-upstream-api.txt is still exported from its file.
import { existsSync, readFileSync } from 'node:fs'

const LIST = 'config/fork-upstream-api.txt'

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function isExported(source, symbol) {
  const name = escape(symbol)
  const declaration = new RegExp(
    `^export\\s+(?:declare\\s+)?(?:default\\s+)?(?:async\\s+)?(?:const|let|var|function\\*?|class|type|interface|enum)\\s+${name}\\b`,
    'm'
  )
  const list = new RegExp(`^export\\s+(?:type\\s+)?\\{[^}]*\\b${name}\\b[^}]*\\}`, 'm')
  return declaration.test(source) || list.test(source)
}

const entries = readFileSync(LIST, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))

const problems = []
for (const entry of entries) {
  const [path, symbol, extra] = entry.split(/\s+/)
  if (!symbol || extra) {
    problems.push(`${LIST}: malformed line "${entry}" (want "<path> <symbol>")`)
  } else if (!existsSync(path)) {
    problems.push(`${path}: file is gone, but the fork reads its export ${symbol}`)
  } else if (!isExported(readFileSync(path, 'utf8'), symbol)) {
    problems.push(`${path}: no longer exports ${symbol}, which the fork reads`)
  }
}
if (problems.length > 0) {
  for (const problem of problems) {
    console.error(problem)
  }
  console.error(
    `A symbol in ${LIST} is no longer exported (upstream un-exported it, or a rebase took upstream's side of the fork's export); restore it or re-home the fork reader.`
  )
  process.exit(1)
}
console.log(`fork upstream api: ${entries.length} pinned upstream exports present`)
