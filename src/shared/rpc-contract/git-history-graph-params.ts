// Fork-only: wire schema for the optional `graph` field of git.history.
import { z } from 'zod'
import {
  GIT_HISTORY_GRAPH_MAX_LIMIT,
  GIT_HISTORY_GRAPH_MODES
} from '../git-history-graph-query-types'

const shortText = z.string().max(500).optional()

export const GitHistoryGraphParams = z.object({
  mode: z.enum(GIT_HISTORY_GRAPH_MODES),
  source: z
    .object({
      local: z.boolean(),
      remotes: z.union([z.literal('all'), z.array(z.string().max(255)).max(100)]),
      tags: z.boolean().optional()
    })
    .optional(),
  refs: z.array(z.string().max(1024)).max(200).optional(),
  listTags: z.boolean().optional(),
  search: z
    .object({ text: shortText, author: shortText, path: z.string().max(4096).optional() })
    .optional(),
  limit: z.number().int().min(1).max(GIT_HISTORY_GRAPH_MAX_LIMIT).optional()
})
