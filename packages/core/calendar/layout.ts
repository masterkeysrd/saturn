import { type DateInput, parseDate } from "../timezone"
import { getDayBoundaries } from "./grid"

export interface TimedEventInput {
  id?: string
  eventId?: string
  instanceId?: string
  startTime: string | Date
  endTime: string | Date
}

export interface TimedEventLayoutItem<
  T extends TimedEventInput = TimedEventInput,
> {
  id: string
  topPct: number
  heightPct: number
  leftPct: number
  widthPct: number
  zIndex: number
  event: T
}

/**
 * Computes interval-graph column layout for timed events within a specific calendar day.
 * Returns layout coordinates in percentages { topPct, heightPct, leftPct, widthPct, zIndex }.
 * Handles cross-midnight clamping, DST day duration scaling, and collision-free side-by-side column packing.
 */
export function computeTimedEventLayout<T extends TimedEventInput>(
  events: T[],
  targetDay: DateInput,
  timeZone: string
): TimedEventLayoutItem<T>[] {
  const { startOfDay, nextDayStart, durationMs } = getDayBoundaries(
    targetDay,
    timeZone
  )
  const dayStartMs = startOfDay.getTime()
  const dayEndMs = nextDayStart.getTime()

  interface ClampedEvent {
    event: T
    clampedStartMs: number
    clampedEndMs: number
    topPct: number
    heightPct: number
    column: number
  }

  const validEvents: ClampedEvent[] = []

  for (const event of events) {
    const sDate = parseDate(event.startTime)
    const eDate = parseDate(event.endTime)
    if (!sDate || !eDate) continue

    const sMs = sDate.getTime()
    let eMs = eDate.getTime()
    if (eMs <= sMs) {
      // Minimum duration fallback: 15 minutes
      eMs = sMs + 15 * 60 * 1000
    }

    // Check if event intersects the target day
    if (eMs <= dayStartMs || sMs >= dayEndMs) {
      continue
    }

    // Cross-midnight clamping to target day boundaries
    const clampedStartMs = Math.max(sMs, dayStartMs)
    const clampedEndMs = Math.min(eMs, dayEndMs)

    if (clampedEndMs <= clampedStartMs) {
      continue
    }

    const topPct = Number(
      Math.max(
        0,
        Math.min(100, ((clampedStartMs - dayStartMs) / durationMs) * 100)
      ).toFixed(3)
    )
    const heightPct = Number(
      Math.max(
        0.5,
        Math.min(
          100 - topPct,
          ((clampedEndMs - clampedStartMs) / durationMs) * 100
        )
      ).toFixed(3)
    )

    validEvents.push({
      event,
      clampedStartMs,
      clampedEndMs,
      topPct,
      heightPct,
      column: 0,
    })
  }

  if (validEvents.length === 0) {
    return []
  }

  // Sort by start ascending, then duration descending (longer events first), then id
  validEvents.sort((a, b) => {
    if (a.clampedStartMs !== b.clampedStartMs) {
      return a.clampedStartMs - b.clampedStartMs
    }
    const durA = a.clampedEndMs - a.clampedStartMs
    const durB = b.clampedEndMs - b.clampedStartMs
    if (durA !== durB) {
      return durB - durA
    }
    const idA = a.event.instanceId || a.event.eventId || a.event.id || ""
    const idB = b.event.instanceId || b.event.eventId || b.event.id || ""
    return idA.localeCompare(idB)
  })

  // Cluster overlapping events into connected components
  const clusters: ClampedEvent[][] = []
  let currentCluster: ClampedEvent[] = []
  let currentClusterEnd = -1

  for (const item of validEvents) {
    if (
      currentCluster.length === 0 ||
      item.clampedStartMs < currentClusterEnd
    ) {
      currentCluster.push(item)
      currentClusterEnd = Math.max(currentClusterEnd, item.clampedEndMs)
    } else {
      clusters.push(currentCluster)
      currentCluster = [item]
      currentClusterEnd = item.clampedEndMs
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster)
  }

  const result: TimedEventLayoutItem<T>[] = []

  // Assign columns within each cluster using greedy packing
  for (const cluster of clusters) {
    const columnEnds: number[] = []

    for (const item of cluster) {
      let placedCol = -1
      for (let c = 0; c < columnEnds.length; c++) {
        if (columnEnds[c] <= item.clampedStartMs) {
          placedCol = c
          columnEnds[c] = item.clampedEndMs
          break
        }
      }

      if (placedCol === -1) {
        placedCol = columnEnds.length
        columnEnds.push(item.clampedEndMs)
      }

      item.column = placedCol
    }

    const totalColumns = Math.max(1, columnEnds.length)

    for (const item of cluster) {
      const widthPct = Number((100 / totalColumns).toFixed(3))
      const leftPct = Number(((item.column / totalColumns) * 100).toFixed(3))
      const id =
        item.event.instanceId || item.event.eventId || item.event.id || ""

      result.push({
        id,
        topPct: item.topPct,
        heightPct: item.heightPct,
        leftPct,
        widthPct,
        zIndex: item.column + 1,
        event: item.event,
      })
    }
  }

  return result
}

export interface BannerEventInput {
  id?: string
  eventId?: string
  instanceId?: string
  startDate: string // "YYYY-MM-DD"
  endDate: string // "YYYY-MM-DD" (exclusive end date)
}

export interface BannerLayoutItem<
  T extends BannerEventInput = BannerEventInput,
> {
  id: string
  event: T
  rowIndex: number
  startCol: number // 0-indexed column within the days array
  spanCols: number // number of columns spanned
  isStart: boolean // true if the event starts on or after rangeStart
  isEnd: boolean // true if the event ends on or before rangeEnd
}

export interface MultiDayBannerLayout<
  T extends BannerEventInput = BannerEventInput,
> {
  items: BannerLayoutItem<T>[]
  totalRows: number
}

/**
 * Computes non-colliding row packing for multi-day and all-day banners across a series of columns.
 * Typically used for the top all-day section of Week/Day view or week rows in Month view.
 */
export function computeMultiDayBannerRows<T extends BannerEventInput>(
  events: T[],
  rangeDays: string[]
): MultiDayBannerLayout<T> {
  if (events.length === 0 || rangeDays.length === 0) {
    return { items: [], totalRows: 0 }
  }

  const rangeStart = rangeDays[0]
  const rangeEnd = rangeDays[rangeDays.length - 1]

  interface Candidate {
    event: T
    startCol: number
    spanCols: number
    isStart: boolean
    isEnd: boolean
  }

  const candidates: Candidate[] = []

  for (const event of events) {
    const sDate = event.startDate
    let eDate = event.endDate

    if (!sDate) continue
    if (!eDate || eDate <= sDate) {
      // If end date is missing or not greater, treat as 1-day event
      eDate = sDate
    }

    // Calendar API uses exclusive endDate for all-day events (e.g. 2026-10-19 to 2026-10-20 is 1 day: Oct 19).
    // If eDate > sDate, the last inclusive date is the day before eDate.
    // If eDate === sDate, the inclusive end date is sDate.
    let lastInclusiveDate = sDate
    if (eDate > sDate) {
      // Find previous day of eDate:
      const [y, m, d] = eDate.split("-").map(Number)
      const prev = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0))
      const py = String(prev.getUTCFullYear()).padStart(4, "0")
      const pm = String(prev.getUTCMonth() + 1).padStart(2, "0")
      const pd = String(prev.getUTCDate()).padStart(2, "0")
      lastInclusiveDate = `${py}-${pm}-${pd}`
    }

    // Check intersection with rangeDays
    if (lastInclusiveDate < rangeStart || sDate > rangeEnd) {
      continue
    }

    const effectiveStart = sDate < rangeStart ? rangeStart : sDate
    const effectiveEnd =
      lastInclusiveDate > rangeEnd ? rangeEnd : lastInclusiveDate

    let startCol = rangeDays.indexOf(effectiveStart)
    let endCol = rangeDays.indexOf(effectiveEnd)

    if (startCol === -1) {
      startCol = 0
    }
    if (endCol === -1) {
      endCol = rangeDays.length - 1
    }

    const spanCols = Math.max(1, endCol - startCol + 1)
    const isStart = sDate >= rangeStart
    const isEnd = lastInclusiveDate <= rangeEnd

    candidates.push({
      event,
      startCol,
      spanCols,
      isStart,
      isEnd,
    })
  }

  // Sort candidates: wider spans first (better packing), then startCol ascending, then id
  candidates.sort((a, b) => {
    if (a.spanCols !== b.spanCols) {
      return b.spanCols - a.spanCols
    }
    if (a.startCol !== b.startCol) {
      return a.startCol - b.startCol
    }
    const idA = a.event.instanceId || a.event.eventId || a.event.id || ""
    const idB = b.event.instanceId || b.event.eventId || b.event.id || ""
    return idA.localeCompare(idB)
  })

  // Pack into rows
  const rowOccupancy: boolean[][] = []
  const items: BannerLayoutItem<T>[] = []

  for (const cand of candidates) {
    let targetRow = -1

    for (let r = 0; r < rowOccupancy.length; r++) {
      let collides = false
      for (let c = cand.startCol; c < cand.startCol + cand.spanCols; c++) {
        if (rowOccupancy[r][c]) {
          collides = true
          break
        }
      }
      if (!collides) {
        targetRow = r
        break
      }
    }

    if (targetRow === -1) {
      targetRow = rowOccupancy.length
      rowOccupancy.push(new Array(rangeDays.length).fill(false))
    }

    for (let c = cand.startCol; c < cand.startCol + cand.spanCols; c++) {
      rowOccupancy[targetRow][c] = true
    }

    const candId =
      cand.event.instanceId || cand.event.eventId || cand.event.id || ""

    items.push({
      id: candId,
      event: cand.event,
      rowIndex: targetRow,
      startCol: cand.startCol,
      spanCols: cand.spanCols,
      isStart: cand.isStart,
      isEnd: cand.isEnd,
    })
  }

  return {
    items,
    totalRows: rowOccupancy.length,
  }
}
