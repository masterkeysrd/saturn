import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useIsFocused } from "expo-router"
import type { CopilotViewRegistration } from "@saturn/core"
import {
  CopilotContextProvider,
  useCopilot,
  useRegisterCopilotView,
} from "@saturn/hooks/ai"
import { useSpace } from "./space-context"

export interface OpenCopilotSheetOptions {
  prompt?: string
  autoSend?: boolean
}

export interface PendingCopilotPrompt {
  id: string
  text: string
  autoSend?: boolean
}

export interface MobileCopilotSheetContextValue {
  isOpen: boolean
  pendingPrompt: PendingCopilotPrompt | null
  openCopilotSheet: (opts?: OpenCopilotSheetOptions) => void
  closeCopilotSheet: () => void
  consumePendingPrompt: () => void
}

const MobileCopilotSheetContext =
  createContext<MobileCopilotSheetContextValue | null>(null)

function MobileCopilotSheetBridge({ children }: { children: ReactNode }) {
  const { isOpen, setOpen, setThreadId } = useCopilot()
  const [pendingPrompt, setPendingPrompt] =
    useState<PendingCopilotPrompt | null>(null)

  const openCopilotSheet = useCallback(
    (opts?: OpenCopilotSheetOptions) => {
      const trimmed = opts?.prompt?.trim()
      if (trimmed) {
        setThreadId(null)
        setPendingPrompt({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          text: trimmed,
          autoSend: opts?.autoSend,
        })
      }
      setOpen(true)
    },
    [setOpen, setThreadId]
  )

  const closeCopilotSheet = useCallback(() => {
    setOpen(false)
  }, [setOpen])

  const consumePendingPrompt = useCallback(() => {
    setPendingPrompt(null)
  }, [])

  const value = useMemo<MobileCopilotSheetContextValue>(
    () => ({
      isOpen,
      pendingPrompt,
      openCopilotSheet,
      closeCopilotSheet,
      consumePendingPrompt,
    }),
    [
      isOpen,
      pendingPrompt,
      openCopilotSheet,
      closeCopilotSheet,
      consumePendingPrompt,
    ]
  )

  return (
    <MobileCopilotSheetContext.Provider value={value}>
      {children}
    </MobileCopilotSheetContext.Provider>
  )
}

export function MobileCopilotProvider({ children }: { children: ReactNode }) {
  const { activeSpaceId } = useSpace()

  return (
    <CopilotContextProvider spaceId={activeSpaceId}>
      <MobileCopilotSheetBridge>{children}</MobileCopilotSheetBridge>
    </CopilotContextProvider>
  )
}

export function useOptionalMobileCopilotSheet(): MobileCopilotSheetContextValue | null {
  return useContext(MobileCopilotSheetContext)
}

export function useMobileCopilotSheet(): MobileCopilotSheetContextValue {
  const ctx = useContext(MobileCopilotSheetContext)
  if (!ctx) {
    throw new Error(
      "useMobileCopilotSheet must be used within MobileCopilotProvider"
    )
  }
  return ctx
}

export function useMobileCopilotView(
  registration: CopilotViewRegistration | null
): void {
  const isFocused = useIsFocused()
  useRegisterCopilotView(isFocused ? registration : null)
}
