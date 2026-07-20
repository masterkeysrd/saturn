import { useState, useCallback, useMemo } from "react"
import { useListSpacesQuery } from "@/gen/saturn/space/v1/space"

const ACTIVE_SPACE_KEY = "active_space_id"
const SPACE_META_KEY = "space_meta"

interface SpaceMeta {
  spaceId: string
  spaceName: string
  spaceRole: string
}

function getActiveSpace(): SpaceMeta | null {
  try {
    const raw = localStorage.getItem(SPACE_META_KEY)
    return raw ? (JSON.parse(raw) as SpaceMeta) : null
  } catch {
    return null
  }
}

function setActiveSpaceMeta(meta: SpaceMeta | null) {
  if (meta) {
    localStorage.setItem(ACTIVE_SPACE_KEY, meta.spaceId)
    localStorage.setItem(SPACE_META_KEY, JSON.stringify(meta))
  } else {
    localStorage.removeItem(ACTIVE_SPACE_KEY)
    localStorage.removeItem(SPACE_META_KEY)
  }
}

export function useActiveSpace() {
  const [meta, setMeta] = useState<SpaceMeta | null>(() => getActiveSpace())

  const spaceId = meta?.spaceId ?? ""
  const spaceName = meta?.spaceName ?? ""
  const spaceRole = meta?.spaceRole ?? ""

  const switchSpace = useCallback((newMeta: SpaceMeta) => {
    setMeta(newMeta)
    setActiveSpaceMeta(newMeta)
  }, [])

  const clearActiveSpace = useCallback(() => {
    setMeta(null)
    setActiveSpaceMeta(null)
  }, [])

  return { spaceId, spaceName, spaceRole, switchSpace, clearActiveSpace }
}

export function useMySpaces() {
  const { data, isLoading, error } = useListSpacesQuery({
    pageSize: 100,
    nextPageToken: "",
  })

  const spaces = useMemo(() => data?.spaces ?? [], [data?.spaces])

  return { spaces, isLoading, error }
}

export function useActiveSpaceContext() {
  const { spaces, isLoading } = useMySpaces()
  const { spaceId, spaceName, spaceRole, switchSpace, clearActiveSpace } =
    useActiveSpace()

  const activeSpace = useMemo(() => {
    return spaces.find((s) => s.id === spaceId) ?? null
  }, [spaces, spaceId])

  const currentRole = useMemo(() => {
    return spaceRole
  }, [spaceRole])

  return {
    activeSpace,
    spaceId,
    spaceName,
    spaceRole: currentRole,
    switchSpace,
    clearActiveSpace,
    isLoading,
  }
}
