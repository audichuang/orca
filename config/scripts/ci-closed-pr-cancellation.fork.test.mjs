import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import { parse } from 'yaml'

const workflow = parse(readFileSync('.github/workflows/ci-closed-pr-caches.yml', 'utf8'))
const step = workflow.jobs.clean.steps[0]
const closed = { number: 123, closed_at: '2026-10-06T00:00:00Z' }
const current = { ...closed, state: 'closed', merged_at: null }

it("cancels the fork's own PR checks run on an unmerged close", async () => {
  const request = vi.fn(async (_route, args) => {
    if (args.concurrency_group_name !== 'fork-pr-checks-123') {
      throw { status: 404 }
    }
    return { data: { group_name: 'fork-pr-checks-123', group_members: [{ run_id: 7 }] } }
  })
  const cancel = vi.fn(async () => {})
  await runInNewContext(`(async () => { ${step.with.script} })()`, {
    context: {
      repo: { owner: 'owner', repo: 'repo' },
      payload: { action: 'closed', pull_request: closed }
    },
    github: {
      request,
      rest: {
        pulls: { get: vi.fn(async () => ({ data: current })) },
        actions: {
          getWorkflowRun: vi.fn(async () => ({
            data: {
              id: 7,
              event: 'pull_request',
              path: '.github/workflows/fork-pr.yml',
              status: 'in_progress',
              created_at: '2026-10-05T23:59:00Z'
            }
          })),
          cancelWorkflowRun: cancel
        }
      }
    },
    core: { info: vi.fn() }
  })

  expect(request.mock.calls.map(([, args]) => args.concurrency_group_name)).toContain(
    'fork-pr-checks-123'
  )
  expect(cancel.mock.calls).toEqual([[{ owner: 'owner', repo: 'repo', run_id: 7 }]])
})
