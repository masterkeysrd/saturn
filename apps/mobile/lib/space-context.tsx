import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useListSpacesQuery,
  type Space,
  type SpaceMember_Role,
} from "@saturn/api/saturn/space/v1/space"
import { useAuth } from "./auth-context"
import { mobileStorage } from "./storage"
import { haptics } from "./haptics"

export interface SpaceContextType {
  spaces: Space[]
  activeSpace: Space | null
  activeSpaceId: string | null
  activeSpaceRole: "owner" | "admin" | "member" | "viewer"
  isLoading: boolean
  isSwitching: boolean
  isOwner: boolean
  canManageMembers: boolean
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

  // Restore stored active space ID on mount
  useEffect(() => {
    async function restoreActiveSpace() {
      try {
        const stored = await mobileStorage.getActiveSpaceId()
        if (stored) {
          setActiveSpaceId(stored)
          setAuthActiveSpace(stored)
        }
      } catch {
        // Fallback
      }
    }
    if (isAuthenticated) {
      restoreActiveSpace()
    }
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

  const activeSpaceRole = useMemo<
    "owner" | "admin" | "member" | "viewer"
  >(() => {
    if (!activeSpace || !user) return "member"
    if (activeSpace.ownerId === user.id) return "owner"
    return "member"
  }, [activeSpace, user])

  const isOwner = activeSpaceRole === "owner"
  const canManageMembers =
    activeSpaceRole === "owner" || activeSpaceRole === "admin"

  const switchSpace = useCallback(
    async (newSpaceId: string) => {
      if (newSpaceId === activeSpaceId) return
      setIsSwitching(true)
      try {
        await mobileStorage.setActiveSpaceId(newSpaceId)
        setActiveSpaceId(newSpaceId)
        setAuthActiveSpace(newSpaceId)
        await haptics.success()
        // Invalidate all tenant queries so dashboard, budgets, transactions refetch
        await queryClient.invalidateQueries()
      } finally {
        setIsSwitching(false)
      }
    },
    [activeSpaceId, queryClient, setAuthActiveSpace]
  )

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
        switchSpace,
        refetchSpaces,
      }}
    >
      {children}
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
