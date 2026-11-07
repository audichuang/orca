// Fork-only: before a local e2e or wire run, wait (bounded) for the 1-minute load to drop to the core count.
// Why: on a loaded Mac, Electron clicks and toasts time out and read as regressions; CI runners are dedicated.
import { availableParallelism, loadavg } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'

const MAX_WAIT_MINUTES = 10
const cores = availableParallelism()
const deadline = Date.now() + MAX_WAIT_MINUTES * 60_000
let load = loadavg()[0]
if (load > cores) {
  console.log(
    `>> load ${load.toFixed(1)} > ${cores} cores; waiting up to ${MAX_WAIT_MINUTES} min first`
  )
  while (load > cores && Date.now() < deadline) {
    await sleep(30_000)
    load = loadavg()[0]
  }
  console.log(
    load > cores
      ? `>> still loaded (${load.toFixed(1)}); running anyway, so read timeouts as load first`
      : `>> load ${load.toFixed(1)}; starting`
  )
}
