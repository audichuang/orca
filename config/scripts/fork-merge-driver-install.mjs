// Fork-only: registers fork-locale-json-merge.mjs for the locale catalogs in this clone (all its worktrees). Idempotent.
// Why a copy in the git dir: a rebase replays old locale commits before the tree has the driver.
// Why info/attributes: it outranks .gitattributes without an upstream edit.
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { join, resolve } from 'node:path'

const ATTRIBUTE = 'src/renderer/src/i18n/locales/*.json merge=fork-locale-json'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

// Git expands %O/%A/%B anywhere in the command, then runs it through sh; a literal path must survive both.
function shellArg(path) {
  const portable = process.platform === 'win32' ? path.replaceAll('\\', '/') : path
  return `'${portable.replaceAll("'", "'\\''").replaceAll('%', '%%')}'`
}

const root = git('rev-parse', '--show-toplevel')
const common = realpathSync(resolve(git('rev-parse', '--git-common-dir')))
const dest = join(common, 'fork-merge-driver')
const driver = join(dest, 'fork-locale-json-merge.mjs')
mkdirSync(dest, { recursive: true })
mkdirSync(join(common, 'info'), { recursive: true })
// Why a rename: a merge in another worktree may run the driver mid-copy, and an empty script exits 0 unmerged.
const staged = `${driver}.${process.pid}.tmp`
copyFileSync(join(root, 'config/scripts/fork-locale-json-merge.mjs'), staged)
renameSync(staged, driver)

git('config', 'merge.fork-locale-json.name', 'fork locale JSON deep merge')
// Exit 2 is the driver's own conflict; anything else (node missing, a crash) gets git's line merge so ours is never left unmarked.
git(
  'config',
  'merge.fork-locale-json.driver',
  `${shellArg(process.execPath)} ${shellArg(driver)} %O %A %B; s=$?; ` +
    '[ $s -eq 0 ] || [ $s -eq 2 ] || git merge-file -L ours -L base -L theirs %A %O %B; [ $s -eq 0 ]'
)

const attributesPath = join(common, 'info', 'attributes')
const attributes = existsSync(attributesPath) ? readFileSync(attributesPath, 'utf8') : ''
if (!attributes.split(/\r?\n/).includes(ATTRIBUTE)) {
  const separator = attributes === '' || attributes.endsWith('\n') ? '' : '\n'
  writeFileSync(attributesPath, `${attributes}${separator}${ATTRIBUTE}\n`)
}
console.log(`fork-merge-driver: locale catalogs merge with ${driver}`)
