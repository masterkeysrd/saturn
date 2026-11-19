import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  createContext,
  useContext,
  createElement,
  type ReactNode,
} from "react"
import {
  useListSpacesQuery,
  useGetSettingsQuery,
} from "@saturn/api/gen/saturn/space/v1/space"
import { TimezoneProvider, useSpaceRole } from "@saturn/hooks"
import { AuthContext } from "@/features/auth/auth-context"
import { useAuth } from "@/features/auth/use-auth"

const ACTIVE_SPACE_KEY = "active_space_id"
const SPACE_META_KEY = "space_meta"

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

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
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth()
  const activeSpaceState = useActiveSpace()
  const { spaceId, clearActiveSpace } = activeSpaceState

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated && spaceId) {
      clearActiveSpace()
    }
  }, [isAuthLoading, isAuthenticated, spaceId, clearActiveSpace])

  const { data: settings } = useGetSettingsQuery(
    { spaceId },
    { enabled: isAuthenticated && !!spaceId }
  )

  const browserTz = useMemo(() => getBrowserTimezone(), [])
  const timezone = settings?.timezone || browserTz

  return createElement(
    ActiveSpaceContext.Provider,
    { value: activeSpaceState },
    createElement(TimezoneProvider, { timezone }, children)
  )
}

export function useMySpaces() {
  const { isAuthenticated } = useAuth()
  const { data, isLoading, error } = useListSpacesQuery(
    {
      pageSize: 100,
      pageToken: "",
    },
    {
      enabled: isAuthenticated,
      staleTime: 1000 * 60 * 30, // 30 minutes cache stale time
    }
  )

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
  const { user, isAuthenticated } = useAuth()

  const { data: settings } = useGetSettingsQuery(
    { spaceId },
    { enabled: isAuthenticated && !!spaceId }
  )
  const browserTz = useMemo(() => getBrowserTimezone(), [])
  const timezone = settings?.timezone || browserTz

  const activeSpace = useMemo(() => {
    return spaces.find((s) => s.id === spaceId) ?? null
  }, [spaces, spaceId])

  const { role: resolvedRole, isLoading: isRoleLoading } = useSpaceRole({
    space: activeSpace,
    userId: user?.id,
    enabled: isAuthenticated && !!activeSpace && !!user?.id,
  })

  const currentRole = useMemo(() => {
    if (!spaceId) return ""
    if (activeSpace && user?.id) {
      if (activeSpace.ownerId === user.id) {
        return "owner"
      }
      if (!isRoleLoading) {
        return resolvedRole
      }
    }
    return spaceRole || ""
  }, [spaceId, activeSpace, user?.id, isRoleLoading, resolvedRole, spaceRole])

  return {
    activeSpace,
    spaceId,
    spaceName,
    spaceRole: currentRole,
    timezone,
    switchSpace,
    clearActiveSpace,
    isLoading,
  }
}

export function useSpacePermissions() {
  const { spaceId, spaceRole } = useActiveSpaceContext()
  const isWritable =
    spaceRole === "owner" || spaceRole === "admin" || spaceRole === "member"
  const canManageSpace = spaceRole === "owner" || spaceRole === "admin"
  return { spaceId, spaceRole, isWritable, canManageSpace }
}

export function useOptionalSpacePermissions() {
  const spaceCtx = useContext(ActiveSpaceContext)
  const authCtx = useContext(AuthContext)
  const spaceId = spaceCtx?.spaceId ?? ""
  const isAuthenticated = authCtx?.isAuthenticated ?? false
  const userId = authCtx?.user?.id ?? ""

  const { data: spacesData } = useListSpacesQuery(
    { pageSize: 100, pageToken: "" },
    {
      enabled: Boolean(spaceCtx && isAuthenticated && spaceId),
      staleTime: 1000 * 60 * 30,
    }
  )

  const activeSpace = useMemo(() => {
    return (spacesData?.spaces ?? []).find((s) => s.id === spaceId) ?? null
  }, [spacesData?.spaces, spaceId])

  const { role: resolvedRole, isLoading: isRoleLoading } = useSpaceRole({
    space: activeSpace,
    userId,
    enabled: Boolean(spaceCtx && isAuthenticated && activeSpace && userId),
  })

  const currentRole = useMemo(() => {
    if (!spaceId) return ""
    if (activeSpace && userId) {
      if (activeSpace.ownerId === userId) {
        return "owner"
      }
      if (!isRoleLoading) {
        return resolvedRole
      }
    }
    return spaceCtx?.spaceRole || ""
  }, [spaceId, activeSpace, userId, isRoleLoading, resolvedRole, spaceCtx])

  const isWritable =
    currentRole === "owner" ||
    currentRole === "admin" ||
    currentRole === "member"
  const canManageSpace = currentRole === "owner" || currentRole === "admin"
  return { spaceId, spaceRole: currentRole, isWritable, canManageSpace }
}

export function resolveSpacePath(
  url: string,
  spaceId: string,
  requiresSpace = false
) {
  if (!spaceId || !requiresSpace) return url

  // If the path already has the correct space prefix, return it as is
  if (url.startsWith(`/space/${spaceId}`)) {
    return url
  }

  // If it starts with /space/ (e.g. /space/settings or /space/agents)
  if (url.startsWith("/space/")) {
    const rest = url.slice(7)
    return `/space/${spaceId}/${rest}`
  }

  const rest = url.startsWith("/") ? url.slice(1) : url
  return `/space/${spaceId}/${rest}`
}
