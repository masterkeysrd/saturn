import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  buildCopilotEntityKey,
  type CopilotEntityRef,
  type CopilotViewRegistration,
} from "@saturn/core"

export interface CopilotContextValue {
  hasProvider: boolean
  isOpen: boolean
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  threadId: string | null
  setThreadId: (threadId: string | null) => void
  activeView: CopilotViewRegistration | null
  isAmbientDismissed: boolean
  dismissAmbient: () => void
  pinnedItems: CopilotEntityRef[]
  attachItem: (item: CopilotEntityRef) => void
  detachItem: (key: string) => void
  toggleItem: (item: CopilotEntityRef) => void
  isPinned: (key: string) => boolean
  clearPinnedItems: () => void
}

interface CopilotInternalActions {
  registerView: (token: string, registration: CopilotViewRegistration) => void
  unregisterView: (token: string) => void
}

const noop = () => {}

const DEFAULT_COPILOT_CONTEXT: CopilotContextValue = {
  hasProvider: false,
  isOpen: false,
  setOpen: noop,
  toggleOpen: noop,
  threadId: null,
  setThreadId: noop,
  activeView: null,
  isAmbientDismissed: false,
  dismissAmbient: noop,
  pinnedItems: [],
  attachItem: noop,
  detachItem: noop,
  toggleItem: noop,
  isPinned: () => false,
  clearPinnedItems: noop,
}

const DEFAULT_INTERNAL_ACTIONS: CopilotInternalActions = {
  registerView: noop,
  unregisterView: noop,
}

const CopilotContext = createContext<CopilotContextValue>(
  DEFAULT_COPILOT_CONTEXT
)
const CopilotInternalContext = createContext<CopilotInternalActions>(
  DEFAULT_INTERNAL_ACTIONS
)

interface ViewEntry {
  token: string
  registration: CopilotViewRegistration
}

export interface CopilotContextProviderProps {
  spaceId?: string | null
  children: ReactNode
}

export function CopilotContextProvider({
  spaceId = null,
  children,
}: CopilotContextProviderProps) {
  const [prevSpaceId, setPrevSpaceId] = useState(spaceId)
  const [isOpen, setIsOpen] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [viewEntries, setViewEntries] = useState<ViewEntry[]>([])
  const [dismissedAmbientKey, setDismissedAmbientKey] = useState<string | null>(
    null
  )
  const [pinnedItems, setPinnedItems] = useState<CopilotEntityRef[]>([])

  if (prevSpaceId !== spaceId) {
    setPrevSpaceId(spaceId)
    setIsOpen(false)
    setThreadId(null)
    setDismissedAmbientKey(null)
    setPinnedItems([])
  }

  const activeView =
    viewEntries.length > 0
      ? viewEntries[viewEntries.length - 1].registration
      : null

  const ambientKey = activeView
    ? `${activeView.viewId}|${activeView.activeEntity?.key ?? ""}`
    : null
  const isAmbientDismissed = Boolean(
    ambientKey && dismissedAmbientKey === ambientKey
  )

  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open)
  }, [])

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const dismissAmbient = useCallback(() => {
    if (ambientKey) {
      setDismissedAmbientKey(ambientKey)
    }
  }, [ambientKey])

  const attachItem = useCallback((item: CopilotEntityRef) => {
    const key = item.key || buildCopilotEntityKey(item.kind, item.id)
    const normalized: CopilotEntityRef =
      item.key === key ? item : { ...item, key }
    setPinnedItems((prev) => {
      if (prev.some((existing) => existing.key === key)) {
        return prev.map((existing) =>
          existing.key === key ? normalized : existing
        )
      }
      return [...prev, normalized]
    })
  }, [])

  const detachItem = useCallback((key: string) => {
    setPinnedItems((prev) => prev.filter((item) => item.key !== key))
  }, [])

  const toggleItem = useCallback((item: CopilotEntityRef) => {
    const key = item.key || buildCopilotEntityKey(item.kind, item.id)
    const normalized: CopilotEntityRef =
      item.key === key ? item : { ...item, key }
    setPinnedItems((prev) => {
      if (prev.some((existing) => existing.key === key)) {
        return prev.filter((existing) => existing.key !== key)
      }
      return [...prev, normalized]
    })
  }, [])

  const isPinned = useCallback(
    (key: string) => pinnedItems.some((item) => item.key === key),
    [pinnedItems]
  )

  const clearPinnedItems = useCallback(() => {
    setPinnedItems([])
  }, [])

  const registerView = useCallback(
    (token: string, registration: CopilotViewRegistration) => {
      setViewEntries((prev) => {
        const idx = prev.findIndex((entry) => entry.token === token)
        if (idx === -1) {
          return [...prev, { token, registration }]
        }
        const next = prev.slice()
        next[idx] = { token, registration }
        return next
      })
    },
    []
  )

  const unregisterView = useCallback((token: string) => {
    setViewEntries((prev) => {
      if (!prev.some((entry) => entry.token === token)) {
        return prev
      }
      return prev.filter((entry) => entry.token !== token)
    })
  }, [])

  const contextValue = useMemo<CopilotContextValue>(
    () => ({
      hasProvider: true,
      isOpen,
      setOpen,
      toggleOpen,
      threadId,
      setThreadId,
      activeView,
      isAmbientDismissed,
      dismissAmbient,
      pinnedItems,
      attachItem,
      detachItem,
      toggleItem,
      isPinned,
      clearPinnedItems,
    }),
    [
      isOpen,
      setOpen,
      toggleOpen,
      threadId,
      activeView,
      isAmbientDismissed,
      dismissAmbient,
      pinnedItems,
      attachItem,
      detachItem,
      toggleItem,
      isPinned,
      clearPinnedItems,
    ]
  )

  const internalActions = useMemo<CopilotInternalActions>(
    () => ({
      registerView,
      unregisterView,
    }),
    [registerView, unregisterView]
  )

  return (
    <CopilotInternalContext.Provider value={internalActions}>
      <CopilotContext.Provider value={contextValue}>
        {children}
      </CopilotContext.Provider>
    </CopilotInternalContext.Provider>
  )
}

export function useCopilot(): CopilotContextValue {
  return useContext(CopilotContext)
}

export function useRegisterCopilotView(
  registration: CopilotViewRegistration | null
): void {
  const token = useId()
  const { registerView, unregisterView } = useContext(CopilotInternalContext)
  const serialized = registration ? JSON.stringify(registration) : null

  const stableRegistration = useMemo<CopilotViewRegistration | null>(() => {
    if (!serialized) return null
    return JSON.parse(serialized) as CopilotViewRegistration
  }, [serialized])

  useEffect(() => {
    if (!stableRegistration) {
      unregisterView(token)
      return
    }
    registerView(token, stableRegistration)
    return () => {
      unregisterView(token)
    }
  }, [token, stableRegistration, registerView, unregisterView])
}

export interface CopilotAttachmentState {
  isCopilotOpen: boolean
  pinnedItems: CopilotEntityRef[]
  attachItem: (item: CopilotEntityRef) => void
  detachItem: (key: string) => void
  toggleItem: (item: CopilotEntityRef) => void
  isPinned: (key: string) => boolean
}

export function useCopilotAttachment(): CopilotAttachmentState {
  const { isOpen, pinnedItems, attachItem, detachItem, toggleItem, isPinned } =
    useCopilot()

  return useMemo(
    () => ({
      isCopilotOpen: isOpen,
      pinnedItems,
      attachItem,
      detachItem,
      toggleItem,
      isPinned,
    }),
    [isOpen, pinnedItems, attachItem, detachItem, toggleItem, isPinned]
  )
}
