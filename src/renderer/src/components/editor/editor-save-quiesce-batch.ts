import { requestEditorSaveQuiesce } from './editor-autosave'

type EditorSaveQuiesceTarget = Parameters<typeof requestEditorSaveQuiesce>[0]

export function releaseEditorSaveHolds(releases: (() => void)[]): void {
  for (const release of releases) {
    release()
  }
}

/** Takes every autosave hold or none: one target that can't be quiesced frees the holds the rest took. */
export async function requestEditorSaveQuiesceAll(
  targets: EditorSaveQuiesceTarget[]
): Promise<(() => void)[]> {
  const quiesced = await Promise.allSettled(
    targets.map((target) => requestEditorSaveQuiesce(target))
  )
  const releases = quiesced.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : []
  )
  const failed = quiesced.find((result) => result.status === 'rejected')
  if (failed) {
    releaseEditorSaveHolds(releases)
    throw failed.reason
  }
  return releases
}
