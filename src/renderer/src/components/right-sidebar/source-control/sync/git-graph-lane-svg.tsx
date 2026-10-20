// Fork-only: draws one full Git Graph row from the re-laid lanes (git-graph-lane-layout.ts).
import React from 'react'
import { translate } from '@/i18n/i18n'
import type { GitHistoryItemViewModel } from '../../../../../../shared/git-history-graph'
import type { GitGraphLaneRow, GitGraphLaneSegment } from './git-graph-lane-layout'
import {
  GitHistoryGraphNodeMarker,
  GraphPath,
  SWIMLANE_HEIGHT as H,
  SWIMLANE_WIDTH as W
} from './git-history-graph-svg'

/** Marks a fold arrow; a click jumps to this commit (empty: not loaded) instead of selecting the row. */
export const GIT_GRAPH_JUMP_ATTRIBUTE = 'data-git-graph-jump'

const x = (column: number): number => W * (column + 1)

function throughPath(from: number, to: number): string {
  if (from === to) {
    return `M ${x(from)} 0 V ${H}`
  }
  return `M ${x(from)} 0 V 4 C ${x(from)} ${H / 2} ${x(to)} ${H / 2} ${x(to)} ${H - 4} V ${H}`
}

function intoNodePath(from: number, node: number): string {
  if (from === node) {
    return `M ${x(node)} 0 V ${H / 2}`
  }
  const dir = node < from ? -1 : 1
  return `M ${x(from)} 0 A ${W} ${W} 0 0 ${dir < 0 ? 1 : 0} ${x(from) + dir * W} ${H / 2} H ${x(node)}`
}

function outOfNodePath(node: number, to: number): string {
  if (to === node) {
    return `M ${x(node)} ${H / 2} V ${H}`
  }
  const dir = to > node ? 1 : -1
  const start = x(to) - dir * W
  return `M ${start} ${H / 2} A ${W} ${W} 0 0 ${dir > 0 ? 1 : 0} ${x(to)} ${H} M ${start} ${H / 2} H ${x(node)}`
}

function foldLabel(
  segment: Extract<GitGraphLaneSegment, { kind: 'fold-down' | 'fold-up' }>
): string {
  const target = segment.target
  if (!target) {
    return translate(
      'auto.components.right.sidebar.GitGraphFullView.laneContinuesPastLoaded',
      'Continues past the loaded commits. Load more commits to follow it.'
    )
  }
  const values = {
    count: segment.rows ?? 0,
    sha: target.displayId ?? target.id.slice(0, 7),
    subject: target.subject
  }
  return segment.kind === 'fold-down'
    ? translate(
        'auto.components.right.sidebar.GitGraphFullView.laneContinuesBelow',
        'Continues {{count}} rows below at {{sha}} {{subject}}. Click to jump.',
        values
      )
    : translate(
        'auto.components.right.sidebar.GitGraphFullView.laneComesFromAbove',
        'Comes from {{sha}} {{subject}}, {{count}} rows above. Click to jump.',
        values
      )
}

function FoldArrow({
  segment
}: {
  segment: Extract<GitGraphLaneSegment, { kind: 'fold-down' | 'fold-up' }>
}): React.JSX.Element {
  const cx = x(segment.at)
  // Why clear of y=12: connectors run horizontally through the middle of the row.
  const d =
    segment.kind === 'fold-down'
      ? `M ${cx} 0 V 9 M ${cx - 3} 6 L ${cx} 9.5 L ${cx + 3} 6`
      : `M ${cx - 3} 18 L ${cx} 14.5 L ${cx + 3} 18 M ${cx} 15 V ${H}`
  return (
    <g
      {...{ [GIT_GRAPH_JUMP_ATTRIBUTE]: segment.target?.id ?? '' }}
      className={segment.target ? 'cursor-pointer' : undefined}
      data-fold={segment.kind}
    >
      <title>{foldLabel(segment)}</title>
      <rect x={cx - W / 2} y={0} width={W} height={H} fill="transparent" />
      <GraphPath d={d} color={segment.color} strokeWidth={1.5} />
    </g>
  )
}

export function GitGraphLaneSvg({
  viewModel,
  lanes
}: {
  viewModel: GitHistoryItemViewModel
  lanes: GitGraphLaneRow
}): React.JSX.Element {
  const node = lanes.nodeColumn
  const width = W * (lanes.laneCount + 1)
  return (
    <svg
      className="shrink-0 overflow-visible"
      width={width}
      height={H}
      viewBox={`0 0 ${width} ${H}`}
      aria-hidden="true"
    >
      {lanes.segments.map((segment, index) => {
        switch (segment.kind) {
          case 'through':
            return (
              <GraphPath
                key={index}
                d={throughPath(segment.from, segment.to)}
                color={segment.color}
              />
            )
          case 'into-node':
            return (
              <GraphPath key={index} d={intoNodePath(segment.from, node)} color={segment.color} />
            )
          case 'out-of-node':
            return (
              <GraphPath key={index} d={outOfNodePath(node, segment.to)} color={segment.color} />
            )
          case 'fold-down':
          case 'fold-up':
            return <FoldArrow key={index} segment={segment} />
        }
      })}
      <GitHistoryGraphNodeMarker viewModel={viewModel} cx={x(node)} color={lanes.nodeColor} />
    </svg>
  )
}
