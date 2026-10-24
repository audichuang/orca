// Fork: options for a single-file diff read, carried in an object so an upstream positional param can't steal the slot.
export type GitDiffReadOptions = {
  /** Copy-to-clipboard needs full text; the render limit only exists to spare the diff viewer. */
  skipRenderLimit?: boolean
}

/** Trailing diff-read argument, omitted when unset so the call keeps upstream's arity. */
export function gitDiffReadArgs(options: GitDiffReadOptions): [] | [GitDiffReadOptions] {
  return options.skipRenderLimit ? [{ skipRenderLimit: true }] : []
}
