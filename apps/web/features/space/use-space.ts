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
import { QueryClientContext } from "@tanstack/react-query"
import {
  useListSpacesQuery,
  useGetSettingsQuery,
} from "@saturn/api/gen/saturn/space/v1/space"
import {
  updateUserPreferences as updateUserPreferencesRequest,
  useGetUserPreferencesQuery,
  useUpdateUserPreferencesMutation,
  type UserPreferences,
} from "@saturn/api/gen/saturn/identity/v1/identity"
import { TimezoneProvider, useSpaceRole } from "@saturn/hooks"
import { AuthContext } from "@/features/auth/auth-context"
import { useAuth } from "@/features/auth/use-auth"
import {
  USER_PREFS_STORAGE_KEY,
  USER_PREFS_UPDATED_EVENT,
  getCachedUserPreferences,
  normalizeCachedUserPreferences,
  setCachedUserPreferences,
  type CachedUserPreferences,
  type UserPreferencesPatch,
} from "@/lib/user-preferences"

const ACTIVE_SPACE_KEY = "active_space_id"
const SPACE_META_KEY = "space_meta"
export const USER_PREFERENCES_QUERY_KEY = [
  "/api/v1/identity/users/me/preferences",
  {},
] as const

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
  userPreferences: CachedUserPreferences
  updateUserPreferences: (
    patch: UserPreferencesPatch,
    paths: string[]
  ) => Promise<CachedUserPreferences>
}

const ActiveSpaceContext = createContext<ActiveSpaceContextType | null>(null)

export function ActiveSpaceProvider({ children }: { children: ReactNode }) {
  const queryClient = useContext(QueryClientContext)
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

  const { data: userPrefs } = useGetUserPreferencesQuery(
    {},
    { enabled: isAuthenticated, staleTime: 1000 * 60 * 10 }
  )
  const updateUserPrefsMutation = useUpdateUserPreferencesMutation()

  const [cachedPrefs, setCachedPrefsState] = useState<CachedUserPreferences>(
    () => getCachedUserPreferences()
  )
  const [overridePrefs, setOverridePrefs] = useState<{
    source: UserPreferences | undefined
    value: CachedUserPreferences
  } | null>(null)

  useEffect(() => {
    const handlePrefsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<CachedUserPreferences>).detail
      if (detail) {
        setCachedPrefsState(normalizeCachedUserPreferences(detail))
      } else {
        setCachedPrefsState(getCachedUserPreferences())
      }
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === USER_PREFS_STORAGE_KEY) {
        setCachedPrefsState(getCachedUserPreferences())
      }
    }
    window.addEventListener(USER_PREFS_UPDATED_EVENT, handlePrefsUpdated)
    window.addEventListener("storage", handleStorage)
    return () => {
      window.removeEventListener(USER_PREFS_UPDATED_EVENT, handlePrefsUpdated)
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated || !userPrefs) return
    setCachedUserPreferences(
      {
        regional: {
          locale: userPrefs.regional?.locale,
          hourCycle: userPrefs.regional?.hourCycle,
          weekStartsOn: userPrefs.regional?.weekStartsOn,
        },
        mail: {
          autoLoadRemoteContent: userPrefs.mail?.autoLoadRemoteContent,
        },
        calendar: {
          webView: userPrefs.calendar?.webView,
          mobileView: userPrefs.calendar?.mobileView,
        },
      },
      { emit: false }
    )
  }, [isAuthenticated, userPrefs])

  const resolvedPrefs = useMemo(() => {
    if (overridePrefs && overridePrefs.source === userPrefs) {
      return overridePrefs.value
    }
    if (isAuthenticated && userPrefs) {
      return normalizeCachedUserPreferences(
        userPrefs,
        cachedPrefs.regional.locale
      )
    }
    return cachedPrefs
  }, [overridePrefs, isAuthenticated, userPrefs, cachedPrefs])

  const updateUserPreferences = useCallback(
    async (
      patch: UserPreferencesPatch,
      paths: string[]
    ): Promise<CachedUserPreferences> => {
      const previous = resolvedPrefs
      const previousQuery = queryClient?.getQueryData<UserPreferences>(
        USER_PREFERENCES_QUERY_KEY
      )
      const next = normalizeCachedUserPreferences(
        {
          regional: {
            locale: patch.regional?.locale ?? previous.regional.locale,
            hourCycle: patch.regional?.hourCycle ?? previous.regional.hourCycle,
            weekStartsOn:
              patch.regional?.weekStartsOn ?? previous.regional.weekStartsOn,
          },
          mail: {
            autoLoadRemoteContent:
              patch.mail?.autoLoadRemoteContent ??
              previous.mail.autoLoadRemoteContent,
          },
          calendar: {
            webView: patch.calendar?.webView ?? previous.calendar.webView,
            mobileView:
              patch.calendar?.mobileView ?? previous.calendar.mobileView,
          },
        },
        previous.regional.locale
      )

      setOverridePrefs({ source: userPrefs, value: next })
      setCachedPrefsState(next)
      setCachedUserPreferences(next)
      queryClient?.setQueryData<UserPreferences>(
        USER_PREFERENCES_QUERY_KEY,
        next
      )

      if (!isAuthenticated || paths.length === 0) {
        return next
      }

      try {
        const updated = await updateUserPrefsMutation.mutateAsync({
          userPreferences: next,
          updateMask: { paths },
        })
        const normalized = normalizeCachedUserPreferences(
          updated,
          next.regional.locale
        )
        setOverridePrefs({ source: userPrefs, value: normalized })
        setCachedPrefsState(normalized)
        setCachedUserPreferences(normalized)
        queryClient?.setQueryData<UserPreferences>(
          USER_PREFERENCES_QUERY_KEY,
          normalized
        )
        return normalized
      } catch (err) {
        setOverridePrefs({ source: userPrefs, value: previous })
        setCachedPrefsState(previous)
        setCachedUserPreferences(previous)
        queryClient?.setQueryData<UserPreferences | undefined>(
          USER_PREFERENCES_QUERY_KEY,
          previousQuery
        )
        throw err
      }
    },
    [
      isAuthenticated,
      queryClient,
      resolvedPrefs,
      updateUserPrefsMutation,
      userPrefs,
    ]
  )

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = resolvedPrefs.regional.locale
    }
  }, [resolvedPrefs.regional.locale])

  const browserTz = useMemo(() => getBrowserTimezone(), [])
  const timezone = settings?.timezone || browserTz

  const contextValue = useMemo<ActiveSpaceContextType>(
    () => ({
      ...activeSpaceState,
      userPreferences: resolvedPrefs,
      updateUserPreferences,
    }),
    [activeSpaceState, resolvedPrefs, updateUserPreferences]
  )

  return createElement(
    ActiveSpaceContext.Provider,
    { value: contextValue },
    createElement(
      TimezoneProvider,
      {
        timezone,
        locale: resolvedPrefs.regional.locale,
        hourCycle: resolvedPrefs.regional.hourCycle,
        weekStartsOn: resolvedPrefs.regional.weekStartsOn,
      },
      children
    )
  )
}

export function useMailRemoteContentPreference() {
  const spaceCtx = useContext(ActiveSpaceContext)
  const queryClient = useContext(QueryClientContext)
  const authCtx = useContext(AuthContext)

  const [cachedPrefs, setCachedPrefsState] = useState<CachedUserPreferences>(
    () => getCachedUserPreferences()
  )
  const [queryPrefs, setQueryPrefs] = useState<UserPreferences | undefined>(
    () => queryClient?.getQueryData<UserPreferences>(USER_PREFERENCES_QUERY_KEY)
  )

  useEffect(() => {
    const handlePrefsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<CachedUserPreferences>).detail
      if (detail) {
        setCachedPrefsState(normalizeCachedUserPreferences(detail))
      } else {
        setCachedPrefsState(getCachedUserPreferences())
      }
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === USER_PREFS_STORAGE_KEY) {
        setCachedPrefsState(getCachedUserPreferences())
      }
    }
    window.addEventListener(USER_PREFS_UPDATED_EVENT, handlePrefsUpdated)
    window.addEventListener("storage", handleStorage)
    return () => {
      window.removeEventListener(USER_PREFS_UPDATED_EVENT, handlePrefsUpdated)
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  useEffect(() => {
    if (!queryClient) return
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      setQueryPrefs(
        queryClient.getQueryData<UserPreferences>(USER_PREFERENCES_QUERY_KEY)
      )
    })
    return unsubscribe
  }, [queryClient])

  const autoLoadRemoteContent = spaceCtx
    ? spaceCtx.userPreferences.mail.autoLoadRemoteContent
    : (queryPrefs?.mail?.autoLoadRemoteContent ??
      cachedPrefs.mail.autoLoadRemoteContent)

  const setAutoLoadRemoteContent = useCallback(
    async (nextValue: boolean): Promise<CachedUserPreferences> => {
      if (spaceCtx) {
        return spaceCtx.updateUserPreferences(
          { mail: { autoLoadRemoteContent: nextValue } },
          ["mail.auto_load_remote_content"]
        )
      }

      const previous = getCachedUserPreferences()
      const previousQuery = queryClient?.getQueryData<UserPreferences>(
        USER_PREFERENCES_QUERY_KEY
      )
      const base = previousQuery
        ? normalizeCachedUserPreferences(
            previousQuery,
            previous.regional.locale
          )
        : previous
      const next = setCachedUserPreferences({
        regional: base.regional,
        mail: { autoLoadRemoteContent: nextValue },
        calendar: base.calendar,
      })
      setCachedPrefsState(next)
      queryClient?.setQueryData<UserPreferences>(
        USER_PREFERENCES_QUERY_KEY,
        next
      )
      setQueryPrefs(next)

      if (!authCtx?.isAuthenticated) {
        return next
      }

      try {
        const updated = await updateUserPreferencesRequest({
          userPreferences: next,
          updateMask: { paths: ["mail.auto_load_remote_content"] },
        })
        const normalized = normalizeCachedUserPreferences(
          updated,
          next.regional.locale
        )
        setCachedUserPreferences(normalized)
        setCachedPrefsState(normalized)
        queryClient?.setQueryData<UserPreferences>(
          USER_PREFERENCES_QUERY_KEY,
          normalized
        )
        setQueryPrefs(normalized)
        return normalized
      } catch (err) {
        setCachedUserPreferences(previous)
        setCachedPrefsState(previous)
        queryClient?.setQueryData<UserPreferences | undefined>(
          USER_PREFERENCES_QUERY_KEY,
          previousQuery
        )
        setQueryPrefs(previousQuery)
        throw err
      }
    },
    [authCtx?.isAuthenticated, queryClient, spaceCtx]
  )

  return {
    autoLoadRemoteContent,
    setAutoLoadRemoteContent,
  }
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

  const {
    spaceId,
    spaceName,
    spaceRole,
    switchSpace,
    clearActiveSpace,
    userPreferences,
    updateUserPreferences,
  } = context
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
    userPreferences,
    updateUserPreferences,
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
