import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type ReactNode,
} from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useListSpacesQuery,
  useGetSettingsQuery,
  type Space,
} from "@saturn/api/saturn/space/v1/space"
import {
  useGetUserPreferencesQuery,
  useUpdateUserPreferencesMutation,
  type UserPreferences,
} from "@saturn/api/saturn/identity/v1/identity"
import { normalizeUserLocale } from "@saturn/i18n"
import {
  TimezoneProvider,
  useSpaceRole,
  type HourCycle,
  type WeekStartsOn,
} from "@saturn/hooks"
import { useAuth } from "./auth-context"
import {
  mobileStorage,
  getUserPreferences,
  setUserPreferences,
  type StoredUserPreferences,
} from "./storage"
import { haptics } from "./haptics"
import { clearPersistedQueryCache } from "./query-persister"
import { setPendingWorkflowDraft } from "@/components/workflows/workflow-draft-store"

const USER_PREFERENCES_QUERY_KEY = [
  "/api/v1/identity/users/me/preferences",
  {},
] as const

function getDefaultDeviceLocale(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().locale
    return normalizeUserLocale(resolved)
  } catch {
    return "en-US"
  }
}

export interface SpaceContextType {
  spaces: Space[]
  activeSpace: Space | null
  activeSpaceId: string | null
  activeSpaceRole: "owner" | "admin" | "member" | "viewer"
  isLoading: boolean
  isSwitching: boolean
  isOwner: boolean
  canManageMembers: boolean
  timezone: string
  locale: string
  hourCycle: HourCycle
  weekStartsOn: WeekStartsOn
  updateRegionalPreferences: (
    patch: Partial<StoredUserPreferences>
  ) => Promise<void>
  switchSpace: (spaceId: string) => Promise<void>
  refetchSpaces: () => void
}

const SpaceContext = createContext<SpaceContextType | undefined>(undefined)

export function SpaceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const {
    user,
    isAuthenticated,
    setActiveSpace: setAuthActiveSpace,
  } = useAuth()
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null)
  const [isSwitching, setIsSwitching] = useState(false)
  const [regionalPrefs, setRegionalPrefs] = useState<StoredUserPreferences>(
    () => ({
      locale: getDefaultDeviceLocale(),
      hourCycle: "h12",
      weekStartsOn: 0,
    })
  )
  const regionalPrefsRef = useRef<StoredUserPreferences>(regionalPrefs)

  // Restore cached regional preferences on mount (persisted across space switches and logouts)
  useEffect(() => {
    let mounted = true
    async function restoreUserPrefs() {
      const stored = await getUserPreferences()
      if (mounted && stored) {
        const normalized: StoredUserPreferences = {
          locale: normalizeUserLocale(stored.locale),
          hourCycle: stored.hourCycle === "h23" ? "h23" : "h12",
          weekStartsOn: stored.weekStartsOn === 1 ? 1 : 0,
        }
        regionalPrefsRef.current = normalized
        setRegionalPrefs(normalized)
      }
    }
    void restoreUserPrefs()
    return () => {
      mounted = false
    }
  }, [])

  // Query user-scoped regional preferences from backend when authenticated
  const { data: userPrefsData } = useGetUserPreferencesQuery(
    {},
    {
      enabled: isAuthenticated,
      staleTime: 1000 * 60 * 5,
    }
  )
  const updateUserPreferencesMutation = useUpdateUserPreferencesMutation()

  useEffect(() => {
    if (!userPrefsData) return
    const next: StoredUserPreferences = {
      locale: userPrefsData.locale
        ? normalizeUserLocale(userPrefsData.locale)
        : getDefaultDeviceLocale(),
      hourCycle: userPrefsData.hourCycle === "h23" ? "h23" : "h12",
      weekStartsOn: userPrefsData.weekStartsOn === 1 ? 1 : 0,
    }
    regionalPrefsRef.current = next
    setRegionalPrefs(next)
    void setUserPreferences(next)
  }, [userPrefsData])

  const updateRegionalPreferences = useCallback(
    async (patch: Partial<StoredUserPreferences>) => {
      const previous = regionalPrefsRef.current
      const next: StoredUserPreferences = {
        locale:
          patch.locale !== undefined
            ? normalizeUserLocale(patch.locale)
            : previous.locale,
        hourCycle:
          patch.hourCycle !== undefined
            ? patch.hourCycle === "h23"
              ? "h23"
              : "h12"
            : previous.hourCycle,
        weekStartsOn:
          patch.weekStartsOn !== undefined
            ? patch.weekStartsOn === 1
              ? 1
              : 0
            : previous.weekStartsOn,
      }

      const paths: string[] = []
      if (patch.locale !== undefined) paths.push("locale")
      if (patch.hourCycle !== undefined) paths.push("hour_cycle")
      if (patch.weekStartsOn !== undefined) paths.push("week_starts_on")

      const previousCached = queryClient.getQueryData<UserPreferences>(
        USER_PREFERENCES_QUERY_KEY
      )

      regionalPrefsRef.current = next
      setRegionalPrefs(next)
      await setUserPreferences(next)
      queryClient.setQueryData<UserPreferences>(
        USER_PREFERENCES_QUERY_KEY,
        next
      )

      if (!isAuthenticated || paths.length === 0) {
        return
      }

      try {
        const updated = await updateUserPreferencesMutation.mutateAsync({
          userPreferences: next,
          updateMask: { paths },
        })
        const synced: StoredUserPreferences = {
          locale: updated.locale
            ? normalizeUserLocale(updated.locale)
            : next.locale,
          hourCycle: updated.hourCycle === "h23" ? "h23" : "h12",
          weekStartsOn: updated.weekStartsOn === 1 ? 1 : 0,
        }
        regionalPrefsRef.current = synced
        setRegionalPrefs(synced)
        await setUserPreferences(synced)
        queryClient.setQueryData<UserPreferences>(
          USER_PREFERENCES_QUERY_KEY,
          synced
        )
      } catch (err) {
        regionalPrefsRef.current = previous
        setRegionalPrefs(previous)
        await setUserPreferences(previous)
        queryClient.setQueryData<UserPreferences | undefined>(
          USER_PREFERENCES_QUERY_KEY,
          previousCached
        )
        throw err
      }
    },
    [isAuthenticated, queryClient, updateUserPreferencesMutation]
  )

  // Query spaces for authenticated user
  const {
    data: spacesData,
    isLoading: isSpacesLoading,
    refetch: refetchSpaces,
  } = useListSpacesQuery(
    {
      pageSize: 100,
      pageToken: "",
    },
    {
      enabled: isAuthenticated,
      staleTime: 1000 * 60 * 5, // 5 minutes cache
    }
  )

  const spaces = useMemo(() => spacesData?.spaces || [], [spacesData?.spaces])

  // Restore stored active space ID on mount, and reset when unauthenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setActiveSpaceId(null)
      return
    }
    async function restoreActiveSpace() {
      try {
        const stored = await mobileStorage.getActiveSpaceId()
        if (stored) {
          setActiveSpaceId(stored)
          await setAuthActiveSpace(stored)
        }
      } catch {
        // Fallback
      }
    }
    restoreActiveSpace()
  }, [isAuthenticated, setAuthActiveSpace])

  // Automatically select first space if none is set or active space is invalid
  useEffect(() => {
    if (!isSpacesLoading && spaces.length > 0) {
      const exists = spaces.some((s) => s.id === activeSpaceId)
      if (!activeSpaceId || !exists) {
        const firstSpaceId = spaces[0].id || null
        if (firstSpaceId) {
          setActiveSpaceId(firstSpaceId)
          mobileStorage.setActiveSpaceId(firstSpaceId)
          setAuthActiveSpace(firstSpaceId)
        }
      }
    }
  }, [activeSpaceId, isSpacesLoading, spaces, setAuthActiveSpace])

  const activeSpace = useMemo(() => {
    return spaces.find((s) => s.id === activeSpaceId) || null
  }, [spaces, activeSpaceId])

  const { role: activeSpaceRole } = useSpaceRole({
    space: activeSpace,
    userId: user?.id,
    enabled: isAuthenticated,
  })

  const isOwner = activeSpaceRole === "owner"
  const canManageMembers =
    activeSpaceRole === "owner" || activeSpaceRole === "admin"

  const switchSpace = useCallback(
    async (newSpaceId: string) => {
      if (!newSpaceId || newSpaceId === activeSpaceId) return
      setIsSwitching(true)
      try {
        setPendingWorkflowDraft(null)
        setActiveSpaceId(newSpaceId)
        await setAuthActiveSpace(newSpaceId)
        queryClient.removeQueries({
          predicate: (q) =>
            q.queryKey[0] !== "/api/v1/spaces" &&
            q.queryKey[0] !== "/api/v1/identity/users/me" &&
            q.queryKey[0] !== "/api/v1/identity/users/me/preferences",
        })
        await clearPersistedQueryCache()
        await haptics.success()
        // Invalidate all tenant queries so dashboard, budgets, transactions refetch
        await queryClient.invalidateQueries()
      } finally {
        setIsSwitching(false)
      }
    },
    [activeSpaceId, queryClient, setAuthActiveSpace]
  )

  const { data: settingsData } = useGetSettingsQuery(
    { spaceId: activeSpaceId ?? "" },
    {
      enabled: isAuthenticated && !!activeSpaceId,
      staleTime: 1000 * 60 * 5,
    }
  )

  const timezone = settingsData?.timezone || "UTC"

  return (
    <SpaceContext.Provider
      value={{
        spaces,
        activeSpace,
        activeSpaceId,
        activeSpaceRole,
        isLoading: isSpacesLoading,
        isSwitching,
        isOwner,
        canManageMembers,
        timezone,
        locale: regionalPrefs.locale,
        hourCycle: regionalPrefs.hourCycle,
        weekStartsOn: regionalPrefs.weekStartsOn,
        updateRegionalPreferences,
        switchSpace,
        refetchSpaces,
      }}
    >
      <TimezoneProvider
        timezone={timezone}
        locale={regionalPrefs.locale}
        hourCycle={regionalPrefs.hourCycle}
        weekStartsOn={regionalPrefs.weekStartsOn}
      >
        {children}
      </TimezoneProvider>
    </SpaceContext.Provider>
  )
}

export function useSpace() {
  const context = useContext(SpaceContext)
  if (!context) {
    throw new Error("useSpace must be used within a SpaceProvider")
  }
  return context
}
