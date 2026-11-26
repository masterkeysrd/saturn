const NICE_STEP_FACTORS = [1, 2, 2.5, 5] as const

export interface NiceSignedTicksResult {
  domainMin: number
  domainMax: number
  ticks: number[]
}

export function computeNiceSignedTicks(
  minCents: number,
  maxCents: number,
  targetTickCount = 5,
  maxIntervalsByPx = 6
): NiceSignedTicksResult {
  const safeMin = Math.min(0, Number.isFinite(minCents) ? minCents : 0)
  let safeMax = Math.max(0, Number.isFinite(maxCents) ? maxCents : 0)

  if (safeMin === 0 && safeMax === 0) {
    safeMax = 10000
  }

  const rawSpan = safeMax - safeMin
  const targetIntervals = Math.max(
    1,
    Math.min(Math.max(targetTickCount - 1, 1), maxIntervalsByPx)
  )
  const rawStep = rawSpan / targetIntervals

  const minExponent = Math.max(0, Math.floor(Math.log10(Math.max(rawStep, 1))))

  let chosenStep = Math.ceil(rawStep)
  let chosenMin = 0
  let chosenMax = 0
  let found = false

  for (let exp = minExponent; exp <= minExponent + 12 && !found; exp++) {
    const scale = 10 ** exp
    for (const factor of NICE_STEP_FACTORS) {
      const candidate = factor * scale
      if (!Number.isInteger(candidate) || candidate < 1) continue

      const dMin = Math.floor(safeMin / candidate) * candidate
      const dMax = Math.ceil(safeMax / candidate) * candidate
      const intervals = Math.round((dMax - dMin) / candidate)

      if (candidate >= rawStep && intervals <= maxIntervalsByPx) {
        chosenStep = candidate
        chosenMin = dMin === 0 ? 0 : dMin
        chosenMax = dMax === 0 ? 0 : dMax
        found = true
        break
      }
    }
  }

  if (!found) {
    const fallbackStep = Math.max(1, Math.ceil(rawSpan / maxIntervalsByPx))
    chosenStep = fallbackStep
    const dMin = Math.floor(safeMin / fallbackStep) * fallbackStep
    const dMax = Math.ceil(safeMax / fallbackStep) * fallbackStep
    chosenMin = dMin === 0 ? 0 : dMin
    chosenMax = dMax === 0 ? 0 : dMax
  }

  const count = Math.round((chosenMax - chosenMin) / chosenStep)
  const ticks: number[] = []
  for (let i = 0; i <= count; i++) {
    const val = chosenMax - i * chosenStep
    ticks.push(val === 0 ? 0 : val)
  }

  return {
    domainMin: chosenMin,
    domainMax: chosenMax,
    ticks,
  }
}
