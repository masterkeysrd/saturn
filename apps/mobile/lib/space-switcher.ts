export type SpaceCycleDirection = "next" | "prev"

export const DEFAULT_SWIPE_THRESHOLD_PX = 22

export function getNextCycledSpace<T extends { id?: string }>(
  spaces: readonly T[],
  activeSpaceId: string | null | undefined,
  direction: SpaceCycleDirection
): T | null {
  const validSpaces = spaces.filter(
    (space) => typeof space.id === "string" && space.id.trim().length > 0
  )
  if (validSpaces.length < 2) {
    return null
  }

  const foundIndex = activeSpaceId
    ? validSpaces.findIndex((space) => space.id === activeSpaceId)
    : -1
  const currentIndex = foundIndex >= 0 ? foundIndex : 0

  if (direction === "next") {
    return validSpaces[(currentIndex + 1) % validSpaces.length]
  }

  return validSpaces[
    (currentIndex - 1 + validSpaces.length) % validSpaces.length
  ]
}

export function resolveVerticalSwipeDirection(
  dy: number,
  dx: number,
  threshold: number = DEFAULT_SWIPE_THRESHOLD_PX
): SpaceCycleDirection | null {
  if (!Number.isFinite(dy) || !Number.isFinite(dx)) {
    return null
  }
  if (Math.abs(dy) < threshold || Math.abs(dx) > Math.abs(dy)) {
    return null
  }
  if (dy < 0) {
    return "next"
  }
  if (dy > 0) {
    return "prev"
  }
  return null
}
