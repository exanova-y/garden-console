import { useMemo, useState } from 'react'
import {
  buildConcentrationFrame,
  type AnalyteKey,
  type GraphSeries,
} from '../page/concentration'
import type { HealthSnapshot } from '../page/types'

type GraphMode = 'separate' | 'combined'

const HOURS_BY_RANGE = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
} as const

function niceStep(raw: number): number {
  if (!(raw > 0)) return 1
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  const nice =
    normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10
  return nice * magnitude
}

function ticks(max: number): number[] {
  const step = niceStep(max / 4)
  return Array.from({ length: 5 }, (_, index) => index * step)
}

function graphPath(
  values: number[],
  max: number,
  width: number,
  height: number,
): string {
  const left = 42
  const right = 12
  const top = 12
  const bottom = 24
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  return values
    .map((value, index) => {
      const x = left + (index / Math.max(1, values.length - 1)) * plotWidth
      const y = top + plotHeight - (value / Math.max(max, 1)) * plotHeight
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function GraphPanel({
  series,
  times,
  startAt,
  endAt,
  planned,
  normalized = false,
}: {
  series: GraphSeries
  times: number[]
  startAt: number
  endAt: number
  planned: Array<{ at: number; label: string; color: string }>
  normalized?: boolean
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const width = 760
  const height = 230
  const observedMax = Math.max(...series.values, 0)
  const max = normalized ? 100 : Math.max(observedMax * 1.12, 1)
  const values =
    normalized && observedMax > 0
      ? series.values.map((value) => (value / observedMax) * 100)
      : series.values
  const yTicks = ticks(max)
  const left = 42
  const right = 12
  const top = 12
  const bottom = 24
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const hoverValue = hoverIndex === null ? null : values[hoverIndex]
  const hoverRawValue = hoverIndex === null ? null : series.values[hoverIndex]
  const hoverX =
    hoverIndex === null
      ? null
      : left + (hoverIndex / Math.max(1, values.length - 1)) * plotWidth
  const hoverY =
    hoverValue === null || hoverValue === undefined
      ? null
      : top + plotHeight - (hoverValue / Math.max(max, 1)) * plotHeight

  function axisLabel(at: number): string {
    const span = endAt - startAt
    return new Date(at).toLocaleString(
      [],
      span <= 48 * 3_600_000
        ? { hour: '2-digit', minute: '2-digit' }
        : { month: 'short', day: 'numeric' },
    )
  }

  return (
    <div className="graph-panel">
      <div className="graph-panel-head">
        <span style={{ color: series.color }}>{series.label}</span>
        <span className="muted">
          {normalized ? 'normalized / 0–100%' : series.unit} /{' '}
          {series.confidence}
        </span>
      </div>
      <svg
        className="concentration-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${series.label} concentration estimate`}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const x = ((event.clientX - rect.left) / rect.width) * width
          if (x < left || x > width - right) {
            setHoverIndex(null)
            return
          }
          setHoverIndex(
            Math.round(((x - left) / plotWidth) * (values.length - 1)),
          )
        }}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {yTicks.map((tick) => {
          const y = top + plotHeight - (tick / Math.max(max, 1)) * plotHeight
          return (
            <g key={tick}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                className="graph-grid-line"
              />
              <text
                x={left - 8}
                y={y + 4}
                textAnchor="end"
                className="graph-axis-label"
              >
                {normalized
                  ? Math.round(tick)
                  : tick >= 100
                    ? Math.round(tick)
                    : tick.toFixed(tick < 1 ? 2 : 1)}
              </text>
            </g>
          )
        })}
        <line
          x1={left}
          x2={left}
          y1={top}
          y2={height - bottom}
          className="graph-axis-line"
        />
        <line
          x1={left}
          x2={width - right}
          y1={height - bottom}
          y2={height - bottom}
          className="graph-axis-line"
        />
        {Array.from({ length: 5 }, (_, index) => {
          const at = startAt + (index / 4) * (endAt - startAt)
          const x = left + (index / 4) * plotWidth
          return (
            <text
              key={at}
              x={x}
              y={height - 6}
              textAnchor="middle"
              className="graph-axis-label"
            >
              {axisLabel(at)}
            </text>
          )
        })}
        <path
          d={graphPath(values, max, width, height)}
          fill="none"
          stroke={series.color}
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
        {planned.map((marker) => {
          const x =
            left +
            ((marker.at - startAt) / Math.max(1, endAt - startAt)) * plotWidth
          if (x < left || x > width - right) return null
          return (
            <g key={`${marker.at}-${marker.label}`}>
              <line
                x1={x}
                x2={x}
                y1={top}
                y2={height - bottom}
                className="planned-line"
              />
              <text x={x + 4} y={top + 10} className="planned-label">
                planned
              </text>
            </g>
          )
        })}
        {hoverX !== null && hoverY !== null && (
          <>
            <line
              x1={hoverX}
              x2={hoverX}
              y1={top}
              y2={height - bottom}
              className="graph-hover-line"
            />
            <circle
              cx={hoverX}
              cy={hoverY}
              r="4"
              fill={series.color}
              className="graph-hover-dot"
            />
          </>
        )}
      </svg>
      {hoverIndex !== null &&
        hoverX !== null &&
        hoverY !== null &&
        hoverValue !== null && (
          <div
            className="graph-tooltip"
            style={{
              left: `${(hoverX / width) * 100}%`,
              top: `${(hoverY / height) * 100}%`,
            }}
          >
            <div>{axisLabel(times[hoverIndex])}</div>
            <strong style={{ color: series.color }}>
              {normalized
                ? `${hoverValue.toFixed(0)}%`
                : hoverValue.toFixed(hoverValue >= 100 ? 0 : 2)}
            </strong>{' '}
            <span>
              {normalized
                ? `(${hoverRawValue?.toFixed(2)} ${series.unit})`
                : series.unit}
            </span>
          </div>
        )}
    </div>
  )
}

export function ConcentrationGraph({ snapshot }: { snapshot: HealthSnapshot }) {
  const [range, setRange] = useState<keyof typeof HOURS_BY_RANGE>('7d')
  const [mode, setMode] = useState<GraphMode>('separate')
  const [visible, setVisible] = useState<Record<AnalyteKey, boolean>>({
    estradiol: true,
    testosterone: true,
    cyproterone: true,
    methylphenidate: true,
    nac: true,
  })
  const frame = useMemo(
    () =>
      buildConcentrationFrame(
        snapshot,
        HOURS_BY_RANGE[range],
        Date.now(),
        range === '24h' ? 25 : 96,
      ),
    [range, snapshot],
  )
  const activeSeries = frame.series.filter(
    (series) => visible[series.key] && Math.max(...series.values, 0) > 0.0001,
  )

  function toggle(key: AnalyteKey) {
    setVisible((current) => ({ ...current, [key]: !current[key] }))
  }

  return (
    <section className="box concentration-graph-card">
      <div className="graph-header">
        <div>
          <p>[ current estimated level ]</p>
          <p className="muted graph-disclaimer">
            refer to peak and trough lab results when possible.
          </p>
        </div>
        <div className="graph-controls">
          <div className="graph-control-row">
            {(['24h', '7d', '30d'] as const).map((option) => (
              <button
                key={option}
                className={range === option ? 'chip active' : 'chip'}
                onClick={() => setRange(option)}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="graph-control-row">
            <button
              className={mode === 'separate' ? 'chip active' : 'chip'}
              onClick={() => setMode('separate')}
            >
              separate
            </button>
            <button
              className={mode === 'combined' ? 'chip active' : 'chip'}
              onClick={() => setMode('combined')}
            >
              one graph
            </button>
          </div>
        </div>
      </div>

      <div className="graph-layer-toggles" aria-label="Graph layers">
        {frame.series.map((series) => (
          <button
            key={series.key}
            className={
              visible[series.key] ? 'layer-toggle active' : 'layer-toggle'
            }
            onClick={() => toggle(series.key)}
          >
            <span
              className="layer-dot"
              style={{ backgroundColor: series.color }}
            />
            {series.label}
          </button>
        ))}
      </div>

      {activeSeries.length === 0 ? (
        <p className="graph-empty">dose history empty</p>
      ) : mode === 'separate' ? (
        <div className="graph-panels">
          {activeSeries.map((series) => (
            <GraphPanel
              key={series.key}
              series={series}
              times={frame.times}
              startAt={frame.startAt}
              endAt={frame.endAt}
              planned={frame.planned.filter(
                (marker) => marker.key === series.key,
              )}
            />
          ))}
        </div>
      ) : (
        <div className="graph-panels">
          <GraphPanel
            series={activeSeries[0]}
            times={frame.times}
            startAt={frame.startAt}
            endAt={frame.endAt}
            planned={frame.planned.filter(
              (marker) => marker.key === activeSeries[0].key,
            )}
            normalized
          />
          <div className="combined-legend">
            {activeSeries.map((series) => (
              <span key={series.key} style={{ color: series.color }}>
                {series.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
