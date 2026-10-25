// Fork check: every symbol pinned in config/fork-upstream-api.txt is still exported from its file.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript-api'

const LIST = 'config/fork-upstream-api.txt'
const EXTENSIONS = ['.ts', '.tsx', '.d.ts', '.mts', '.js', '.mjs']

function resolveModule(fromFile, specifier) {
  if (!specifier.startsWith('.')) {
    return undefined
  }
  const base = resolve(dirname(fromFile), specifier)
  const stem = base.replace(/\.(m?js|jsx)$/, '')
  const candidates = [
    base,
    ...EXTENSIONS.map((ext) => stem + ext),
    ...EXTENSIONS.map((ext) => `${base}/index${ext}`)
  ]
  return candidates.find((path) => existsSync(path) && statSync(path).isFile())
}

function bindingNames(name, out) {
  if (ts.isIdentifier(name)) {
    out.add(name.text)
    return
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) {
      bindingNames(element.name, out)
    }
  }
}

const hasModifier = (node, kind) =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind)

/** Names a module exports, `default` included; `export *` is followed through relative specifiers. */
export function exportedNames(file, visited = new Set()) {
  const names = new Set()
  const path = resolve(file)
  if (visited.has(path)) {
    return names
  }
  visited.add(path)
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause
      if (clause && ts.isNamedExports(clause)) {
        for (const element of clause.elements) {
          names.add(element.name.text)
        }
      } else if (clause && ts.isNamespaceExport(clause)) {
        names.add(clause.name.text)
      } else if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
        const target = resolveModule(path, statement.moduleSpecifier.text)
        for (const name of target ? exportedNames(target, visited) : []) {
          if (name !== 'default') {
            names.add(name)
          }
        }
      }
    } else if (ts.isExportAssignment(statement)) {
      if (!statement.isExportEquals) {
        names.add('default')
      }
    } else if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
        names.add('default')
      } else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          bindingNames(declaration.name, names)
        }
      } else if (statement.name && ts.isIdentifier(statement.name)) {
        names.add(statement.name.text)
      }
    }
  }
  return names
}

/** Problems with the pin list text; paths resolve against `root`. */
export function pinProblems(listText, root = process.cwd()) {
  const entries = listText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  const problems = []
  for (const entry of entries) {
    const [path, symbol, extra] = entry.split(/\s+/)
    const file = resolve(root, path)
    if (!symbol || extra) {
      problems.push(`${LIST}: malformed line "${entry}" (want "<path> <symbol>")`)
    } else if (!existsSync(file)) {
      problems.push(`${path}: file is gone, but the fork reads its export ${symbol}`)
    } else if (!exportedNames(file).has(symbol)) {
      problems.push(`${path}: no longer exports ${symbol}, which the fork reads`)
    }
  }
  return { entries: entries.length, problems }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { entries, problems } = pinProblems(readFileSync(LIST, 'utf8'))
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem)
    }
    console.error(
      `A symbol in ${LIST} is no longer exported (upstream un-exported it, or a rebase took upstream's side of the fork's export); restore it or re-home the fork reader.`
    )
    process.exit(1)
  }
  console.log(`fork upstream api: ${entries} pinned upstream exports present`)
}
