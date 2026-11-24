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
  normalizeStoredUserPreferences,
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

function sanitizeStoredPreferences(
  input: Parameters<typeof normalizeStoredUserPreferences>[0],
  fallbackLocale: string
): StoredUserPreferences {
  const normalized = normalizeStoredUserPreferences(input, fallbackLocale)
  return {
    ...normalized,
    regional: {
      ...normalized.regional,
      locale: normalizeUserLocale(normalized.regional.locale),
    },
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
  mailAutoLoadRemoteContent: boolean
  updateRegionalPreferences: (
    patch: Partial<StoredUserPreferences["regional"]>
  ) => Promise<void>
  updateMailPreferences: (
    patch: Partial<StoredUserPreferences["mail"]>
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
  const [userPrefs, setUserPrefs] = useState<StoredUserPreferences>(() =>
    sanitizeStoredPreferences(null, getDefaultDeviceLocale())
  )
  const userPrefsRef = useRef<StoredUserPreferences>(userPrefs)

  // Restore cached preferences on mount (persisted across space switches and logouts)
  useEffect(() => {
    let mounted = true
    async function restoreUserPrefs() {
      const stored = await getUserPreferences()
      if (mounted && stored) {
        const normalized = sanitizeStoredPreferences(
          stored,
          getDefaultDeviceLocale()
        )
        userPrefsRef.current = normalized
        setUserPrefs(normalized)
      }
    }
    void restoreUserPrefs()
    return () => {
      mounted = false
    }
  }, [])

  // Query user-scoped preferences from backend when authenticated
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
    const next = sanitizeStoredPreferences(
      userPrefsData,
      getDefaultDeviceLocale()
    )
    userPrefsRef.current = next
    setUserPrefs(next)
    void setUserPreferences(next)
  }, [userPrefsData])

  const applyUserPreferencesUpdate = useCallback(
    async (next: StoredUserPreferences, paths: string[]) => {
      const previous = userPrefsRef.current
      const previousCached = queryClient.getQueryData<UserPreferences>(
        USER_PREFERENCES_QUERY_KEY
      )

      userPrefsRef.current = next
      setUserPrefs(next)
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
        const synced = sanitizeStoredPreferences(updated, next.regional.locale)
        userPrefsRef.current = synced
        setUserPrefs(synced)
        await setUserPreferences(synced)
        queryClient.setQueryData<UserPreferences>(
          USER_PREFERENCES_QUERY_KEY,
          synced
        )
      } catch (err) {
        userPrefsRef.current = previous
        setUserPrefs(previous)
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

  const updateRegionalPreferences = useCallback(
    async (patch: Partial<StoredUserPreferences["regional"]>) => {
      const previous = userPrefsRef.current
      const next = sanitizeStoredPreferences(
        {
          ...previous,
          regional: {
            locale:
              patch.locale !== undefined
                ? normalizeUserLocale(patch.locale)
                : previous.regional.locale,
            hourCycle:
              patch.hourCycle !== undefined
                ? patch.hourCycle === "h23"
                  ? "h23"
                  : "h12"
                : previous.regional.hourCycle,
            weekStartsOn:
              patch.weekStartsOn !== undefined
                ? patch.weekStartsOn === 1
                  ? 1
                  : 0
                : previous.regional.weekStartsOn,
          },
        },
        previous.regional.locale
      )

      const paths: string[] = []
      if (patch.locale !== undefined) paths.push("regional.locale")
      if (patch.hourCycle !== undefined) paths.push("regional.hour_cycle")
      if (patch.weekStartsOn !== undefined) {
        paths.push("regional.week_starts_on")
      }

      await applyUserPreferencesUpdate(next, paths)
    },
    [applyUserPreferencesUpdate]
  )

  const updateMailPreferences = useCallback(
    async (patch: Partial<StoredUserPreferences["mail"]>) => {
      const previous = userPrefsRef.current
      const next = sanitizeStoredPreferences(
        {
          ...previous,
          mail: {
            autoLoadRemoteContent:
              patch.autoLoadRemoteContent !== undefined
                ? Boolean(patch.autoLoadRemoteContent)
                : previous.mail.autoLoadRemoteContent,
          },
        },
        previous.regional.locale
      )

      const paths: string[] = []
      if (patch.autoLoadRemoteContent !== undefined) {
        paths.push("mail.auto_load_remote_content")
      }

      await applyUserPreferencesUpdate(next, paths)
    },
    [applyUserPreferencesUpdate]
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
        locale: userPrefs.regional.locale,
        hourCycle: userPrefs.regional.hourCycle,
        weekStartsOn: userPrefs.regional.weekStartsOn,
        mailAutoLoadRemoteContent: userPrefs.mail.autoLoadRemoteContent,
        updateRegionalPreferences,
        updateMailPreferences,
        switchSpace,
        refetchSpaces,
      }}
    >
      <TimezoneProvider
        timezone={timezone}
        locale={userPrefs.regional.locale}
        hourCycle={userPrefs.regional.hourCycle}
        weekStartsOn={userPrefs.regional.weekStartsOn}
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
