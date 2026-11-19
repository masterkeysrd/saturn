import { describe, it, expect } from "vitest"
import {
  buildCopilotEntityKey,
  deduplicateCopilotEntityRefs,
  formatCopilotPromptWithContext,
  parseCopilotMessageContext,
  type CopilotEntityKind,
  type CopilotEntityRef,
} from "./copilot-context"

describe("@saturn/core/ai copilot-context", () => {
  it("builds deterministic entity keys for all supported kinds", () => {
    const cases: Array<{
      kind: CopilotEntityKind
      id: string
      expected: string
    }> = [
      { kind: "transaction", id: "tx_1", expected: "transaction:tx_1" },
      { kind: "budget", id: "bgt_2", expected: "budget:bgt_2" },
      { kind: "account", id: "acc_3", expected: "account:acc_3" },
      { kind: "statement", id: "stm_4", expected: "statement:stm_4" },
      { kind: "mail_thread", id: "mth_5", expected: "mail_thread:mth_5" },
      { kind: "calendar_event", id: "evt_6", expected: "calendar_event:evt_6" },
      { kind: "workflow", id: "flw_7", expected: "workflow:flw_7" },
    ]

    for (const tc of cases) {
      expect(buildCopilotEntityKey(tc.kind, tc.id)).toBe(tc.expected)
    }
  })

  it("formats prompts with and without attached context", () => {
    const budgetRef: CopilotEntityRef = {
      key: "budget:bgt_1",
      kind: "budget",
      id: "bgt_1",
      label: "Groceries",
      summary: { currency: "USD", limit: 60000, active: true },
    }

    const cases: Array<{
      name: string
      prompt: string
      refs: CopilotEntityRef[]
      expected: string
    }> = [
      {
        name: "returns prompt unchanged when refs empty",
        prompt: "How much did I spend this month?",
        refs: [],
        expected: "How much did I spend this month?",
      },
      {
        name: "prepends attached_context envelope and deduplicates by key",
        prompt: "Why am I over budget?",
        refs: [budgetRef, budgetRef],
        expected: `<attached_context>\n${JSON.stringify([budgetRef])}\n</attached_context>\n\nWhy am I over budget?`,
      },
    ]

    for (const tc of cases) {
      expect(formatCopilotPromptWithContext(tc.prompt, tc.refs)).toBe(
        tc.expected
      )
    }
  })

  it("parses attached_context envelopes safely in linear time", () => {
    const refA: CopilotEntityRef = {
      key: "mail_thread:mth_101",
      kind: "mail_thread",
      id: "mth_101",
      label: "Q3 Budget Review",
      summary: { unread: true, messageCount: 2 },
    }
    const refB: CopilotEntityRef = {
      key: "account:acc_1",
      kind: "account",
      id: "acc_1",
      label: "Chase Sapphire",
    }

    const validEnvelope = formatCopilotPromptWithContext(
      "Summarize this thread and check the account.",
      [refA, refB]
    )

    const cases: Array<{
      name: string
      input: string
      expectedRefs: CopilotEntityRef[]
      expectedCleanText: string
    }> = [
      {
        name: "plain text without tag",
        input: "Check my balances",
        expectedRefs: [],
        expectedCleanText: "Check my balances",
      },
      {
        name: "valid roundtrip envelope",
        input: validEnvelope,
        expectedRefs: [refA, refB],
        expectedCleanText: "Summarize this thread and check the account.",
      },
      {
        name: "tag appearing mid-message is ignored",
        input: "Here is <attached_context>[]</attached_context> inline",
        expectedRefs: [],
        expectedCleanText:
          "Here is <attached_context>[]</attached_context> inline",
      },
      {
        name: "unclosed tag returns original text",
        input: '<attached_context>[{"kind":"budget","id":"b1","label":"Food"}]',
        expectedRefs: [],
        expectedCleanText:
          '<attached_context>[{"kind":"budget","id":"b1","label":"Food"}]',
      },
      {
        name: "malformed JSON returns original text",
        input: "<attached_context>{not-json}</attached_context>\n\nHello",
        expectedRefs: [],
        expectedCleanText:
          "<attached_context>{not-json}</attached_context>\n\nHello",
      },
      {
        name: "filters out invalid entity items and preserves valid ones",
        input:
          '<attached_context>[{"kind":"unknown","id":"x","label":"Bad"},{"kind":"transaction","id":"tx_9","label":"Coffee","summary":{"amount":450,"badNested":{}}}]</attached_context>\n\nCategorize this',
        expectedRefs: [
          {
            key: "transaction:tx_9",
            kind: "transaction",
            id: "tx_9",
            label: "Coffee",
            summary: { amount: 450 },
          },
        ],
        expectedCleanText: "Categorize this",
      },
      {
        name: "all invalid items returns original text",
        input:
          '<attached_context>[{"kind":"invalid","id":"","label":""}]</attached_context>\n\nHi',
        expectedRefs: [],
        expectedCleanText:
          '<attached_context>[{"kind":"invalid","id":"","label":""}]</attached_context>\n\nHi',
      },
    ]

    for (const tc of cases) {
      const parsed = parseCopilotMessageContext(tc.input)
      expect(parsed.refs, tc.name).toEqual(tc.expectedRefs)
      expect(parsed.cleanText, tc.name).toBe(tc.expectedCleanText)
    }
  })

  it("deduplicates refs while preserving order and handles pathological unclosed tags linearly", () => {
    const refs: CopilotEntityRef[] = [
      { key: "budget:1", kind: "budget", id: "1", label: "One" },
      { key: "account:2", kind: "account", id: "2", label: "Two" },
      { key: "budget:1", kind: "budget", id: "1", label: "One duplicate" },
    ]
    expect(deduplicateCopilotEntityRefs(refs)).toEqual([refs[0], refs[1]])

    const start = performance.now()
    const pathological = parseCopilotMessageContext(
      `<attached_context>${"a".repeat(20000)}`
    )
    const elapsedMs = performance.now() - start
    expect(pathological.refs).toEqual([])
    expect(elapsedMs).toBeLessThan(50)
  })
})
