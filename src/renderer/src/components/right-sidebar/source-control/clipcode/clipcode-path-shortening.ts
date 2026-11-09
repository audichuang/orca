// Fork-only: middle ellipsis for long `/`-joined paths, keeping the file name readable.

const ELLIPSIS = '…'
// Why a fixed locale: grapheme boundaries are not language-tailored, and the UI language must not move a cut.
const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })

function graphemes(text: string): string[] {
  return Array.from(graphemeSegmenter.segment(text), (part) => part.segment)
}

/** The largest count in [low, high] whose text fits, assuming width grows with the count. */
function longestFitting(
  low: number,
  high: number,
  textFor: (count: number) => string,
  fits: (text: string) => boolean
): string | undefined {
  if (low > high || !fits(textFor(low))) {
    return undefined
  }
  let best = low
  let top = high
  while (best < top) {
    const middle = Math.ceil((best + top) / 2)
    if (fits(textFor(middle))) {
      best = middle
    } else {
      top = middle - 1
    }
  }
  return textFor(best)
}

/**
 * Shortens `path` to `maxWidth`: the folder part shrinks first, down to its first segment and `…`; then the
 * file name loses characters from its middle, keeping its extension. Cuts fall between whole graphemes.
 */
export function shortenPathToWidth(
  path: string,
  maxWidth: number,
  measure: (text: string) => number
): string {
  const fits = (text: string): boolean => measure(text) <= maxWidth
  if (fits(path)) {
    return path
  }
  const slash = path.lastIndexOf('/')
  const folder = slash === -1 ? '' : path.slice(0, slash)
  const name = path.slice(slash + 1)
  const prefixes: string[] = ['']
  if (folder) {
    const firstSlash = folder.indexOf('/')
    if (firstSlash === -1) {
      prefixes[0] = `${folder}/`
    } else {
      const folderParts = graphemes(folder)
      const firstSegment = folder.slice(0, firstSlash + 1)
      const shortFolder = longestFitting(
        graphemes(firstSegment).length,
        folderParts.length - 1,
        (count) => `${folderParts.slice(0, count).join('')}${ELLIPSIS}/${name}`,
        fits
      )
      if (shortFolder !== undefined) {
        return shortFolder
      }
      prefixes[0] = `${firstSegment}${ELLIPSIS}/`
    }
    // Why: the whole file name outranks the folder's first segment.
    if (fits(`${ELLIPSIS}/${name}`)) {
      return `${ELLIPSIS}/${name}`
    }
    prefixes.push(`${ELLIPSIS}/`)
  }
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? name.slice(dot) : ''
  const stem = graphemes(dot > 0 ? name.slice(0, dot) : name)
  // Why both ends of the stem: names sharing a long prefix differ near the extension.
  const shortName = (count: number): string => {
    const head = Math.ceil(count / 2)
    return `${stem.slice(0, head).join('')}${ELLIPSIS}${stem.slice(stem.length - (count - head)).join('')}${extension}`
  }
  for (const prefix of prefixes) {
    const shortened = longestFitting(0, stem.length - 1, (count) => prefix + shortName(count), fits)
    if (shortened !== undefined) {
      return shortened
    }
  }
  return `${ELLIPSIS}${extension}`
}
