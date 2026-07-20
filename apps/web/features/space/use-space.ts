import {
  useState,
  useCallback,
  useMemo,
  createContext,
  useContext,
  createElement,
  type ReactNode,
} from "react"
import { useListSpacesQuery } from "@/gen/saturn/space/v1/space"
import { useAuth } from "@/features/auth/use-auth"

const ACTIVE_SPACE_KEY = "active_space_id"
const SPACE_META_KEY = "space_meta"

export interface SpaceMeta {
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

// Global React Context for Active Workspace State
interface ActiveSpaceContextType {
  spaceId: string
  spaceName: string
  spaceRole: string
  switchSpace: (newMeta: SpaceMeta) => void
  clearActiveSpace: () => void
}

const ActiveSpaceContext = createContext<ActiveSpaceContextType | null>(null)

export function ActiveSpaceProvider({ children }: { children: ReactNode }) {
  const activeSpaceState = useActiveSpace()
  return createElement(
    ActiveSpaceContext.Provider,
    { value: activeSpaceState },
    children
  )
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
  const context = useContext(ActiveSpaceContext)
  if (!context) {
    throw new Error(
      "useActiveSpaceContext must be used within an ActiveSpaceProvider"
    )
  }

  const { spaceId, spaceName, spaceRole, switchSpace, clearActiveSpace } =
    context
  const { spaces, isLoading } = useMySpaces()
  const { user } = useAuth()

  const activeSpace = useMemo(() => {
    return spaces.find((s) => s.id === spaceId) ?? null
  }, [spaces, spaceId])

  const currentRole = useMemo(() => {
    if (activeSpace && user && activeSpace.ownerId === user.id) {
      return "owner"
    }
    return spaceRole || "member"
  }, [spaceRole, activeSpace, user])

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
