import { describe, it, expect } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { type ReactNode } from "react"
import type { CopilotEntityRef, CopilotViewRegistration } from "@saturn/core"
import {
  CopilotContextProvider,
  useCopilot,
  useCopilotAttachment,
  useRegisterCopilotView,
} from "./use-copilot-context"

describe("@saturn/hooks use-copilot-context", () => {
  function createWrapper(spaceId: string | null = "spc_1") {
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <CopilotContextProvider spaceId={spaceId}>
          {children}
        </CopilotContextProvider>
      )
    }
  }

  it("provides safe no-op fallbacks when rendered outside CopilotContextProvider", () => {
    const { result } = renderHook(() => {
      useRegisterCopilotView({
        viewId: "finance.budgets",
        title: "Budgets",
      })
      return {
        copilot: useCopilot(),
        attachment: useCopilotAttachment(),
      }
    })

    expect(result.current.copilot.hasProvider).toBe(false)
    expect(result.current.copilot.isOpen).toBe(false)
    expect(result.current.copilot.activeView).toBeNull()
    expect(result.current.copilot.pinnedItems).toEqual([])
    expect(result.current.attachment.isCopilotOpen).toBe(false)
    expect(result.current.attachment.isPinned("budget:bgt_1")).toBe(false)

    act(() => {
      result.current.copilot.toggleOpen()
      result.current.copilot.attachItem({
        key: "budget:bgt_1",
        kind: "budget",
        id: "bgt_1",
        label: "Groceries",
      })
    })
    expect(result.current.copilot.isOpen).toBe(false)
    expect(result.current.copilot.pinnedItems).toEqual([])
  })

  it("manages open state, pinned items, and resets cleanly on spaceId change", () => {
    const budgetRef: CopilotEntityRef = {
      key: "budget:bgt_1",
      kind: "budget",
      id: "bgt_1",
      label: "Groceries",
    }
    const accountRef: CopilotEntityRef = {
      key: "account:acc_1",
      kind: "account",
      id: "acc_1",
      label: "Checking",
    }

    let currentSpaceId = "spc_1"
    const { result, rerender } = renderHook(
      () => ({
        copilot: useCopilot(),
        attachment: useCopilotAttachment(),
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <CopilotContextProvider spaceId={currentSpaceId}>
            {children}
          </CopilotContextProvider>
        ),
      }
    )

    expect(result.current.copilot.hasProvider).toBe(true)
    expect(result.current.copilot.isOpen).toBe(false)

    act(() => {
      result.current.copilot.toggleOpen()
      result.current.copilot.setThreadId("thr_1")
      result.current.attachment.attachItem(budgetRef)
      result.current.attachment.toggleItem(accountRef)
    })

    expect(result.current.copilot.isOpen).toBe(true)
    expect(result.current.attachment.isCopilotOpen).toBe(true)
    expect(result.current.copilot.threadId).toBe("thr_1")
    expect(result.current.copilot.pinnedItems).toEqual([budgetRef, accountRef])
    expect(result.current.attachment.isPinned("budget:bgt_1")).toBe(true)

    act(() => {
      result.current.attachment.toggleItem(budgetRef)
    })
    expect(result.current.copilot.pinnedItems).toEqual([accountRef])

    act(() => {
      result.current.attachment.detachItem("account:acc_1")
    })
    expect(result.current.copilot.pinnedItems).toEqual([])

    act(() => {
      result.current.attachment.attachItem(budgetRef)
    })
    expect(result.current.copilot.pinnedItems).toEqual([budgetRef])

    // Switch spaceId -> resets open state, threadId, and pinnedItems
    currentSpaceId = "spc_2"
    rerender()

    expect(result.current.copilot.isOpen).toBe(false)
    expect(result.current.copilot.threadId).toBeNull()
    expect(result.current.copilot.pinnedItems).toEqual([])
  })

  it("registers activeView declaratively, resets ambient dismissal on entity change, and unregisters on unmount", () => {
    const initialView: CopilotViewRegistration = {
      viewId: "mail.inbox",
      title: "Mail",
      activeEntity: {
        key: "mail_thread:mth_1",
        kind: "mail_thread",
        id: "mth_1",
        label: "Invoice Q1",
      },
      suggestions: ["Summarize this thread"],
    }

    const { result, rerender, unmount } = renderHook(
      ({ reg }: { reg: CopilotViewRegistration | null }) => {
        useRegisterCopilotView(reg)
        return useCopilot()
      },
      {
        initialProps: { reg: initialView as CopilotViewRegistration | null },
        wrapper: createWrapper("spc_1"),
      }
    )

    expect(result.current.activeView).toEqual(initialView)
    expect(result.current.isAmbientDismissed).toBe(false)

    act(() => {
      result.current.dismissAmbient()
    })
    expect(result.current.isAmbientDismissed).toBe(true)

    // Changing activeEntity.key automatically resets ambient dismissal
    const nextThreadView: CopilotViewRegistration = {
      viewId: "mail.inbox",
      title: "Mail",
      activeEntity: {
        key: "mail_thread:mth_2",
        kind: "mail_thread",
        id: "mth_2",
        label: "Team Offsite",
      },
      suggestions: ["Summarize this thread"],
    }
    rerender({ reg: nextThreadView })

    expect(result.current.activeView).toEqual(nextThreadView)
    expect(result.current.isAmbientDismissed).toBe(false)

    // Passing null unregisters cleanly
    rerender({ reg: null })
    expect(result.current.activeView).toBeNull()

    unmount()
  })
})
