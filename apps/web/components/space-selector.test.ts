import { describe, it, expect } from "vitest"
import { resolveNextSpaceRoute } from "@/lib/space-route"

describe("resolveNextSpaceRoute", () => {
  it.each([
    { pathname: "/", nextSpaceId: "spc_2", expected: null },
    { pathname: "/settings/account", nextSpaceId: "spc_2", expected: null },
    { pathname: "/admin/users", nextSpaceId: "spc_2", expected: null },
    {
      pathname: "/space/spc_1/calendar",
      nextSpaceId: "spc_2",
      expected: "/space/spc_2/calendar",
    },
    {
      pathname: "/space/spc_1/mail",
      nextSpaceId: "spc_2",
      expected: "/space/spc_2/mail",
    },
    {
      pathname: "/space/spc_1/finance",
      nextSpaceId: "spc_2",
      expected: "/space/spc_2/finance",
    },
    {
      pathname: "/space/spc_1/finance/transactions",
      nextSpaceId: "spc_2",
      expected: "/space/spc_2/finance/transactions",
    },
    {
      pathname: "/space/spc_1/finance/accounts",
      nextSpaceId: "spc_2",
      expected: "/space/spc_2/finance/accounts",
    },
    {
      pathname: "/space/spc_1/finance/budgets",
      nextSpaceId: "spc_2",
      expected: "/space/spc_2/finance/budgets",
    },
    {
      pathname: "/space/spc_1/finance/inbox",
      nextSpaceId: "spc_2",
      expected: "/space/spc_2/finance/inbox",
    },
    {
      pathname: "/space/spc_1/finance/reconcile/stmt_123",
      nextSpaceId: "spc_2",
      expected: "/space/spc_2/finance/reconcile",
    },
    {
      pathname: "/space/spc_1/finance/recurring",
      nextSpaceId: "spc_2",
      expected: "/space/spc_2/finance/recurring",
    },
    {
      pathname: "/space/spc_1/finance/rates",
      nextSpaceId: "spc_2",
      expected: "/space/spc_2/finance/rates",
    },
    {
      pathname: "/space/spc_1/finance/borrowings",
      nextSpaceId: "spc_2",
      expected: "/space/spc_2/finance/borrowings",
    },
    {
      pathname: "/space/spc_1/workflows/flw_999",
      nextSpaceId: "spc_2",
      expected: "/space/spc_2/workflows",
    },
    {
      pathname: "/space/spc_1/workflows/runs/run_123",
      nextSpaceId: "spc_2",
      expected: "/space/spc_2/workflows/runs",
    },
    {
      pathname: "/space/spc_1/ai/chat/thr_42",
      nextSpaceId: "spc_2",
      expected: "/space/spc_2/ai/chat",
    },
    {
      pathname: "/space/spc_1/ai/agents",
      nextSpaceId: "spc_2",
      expected: "/space/spc_2/ai/agents",
    },
    {
      pathname: "/space/spc_1/ai/models",
      nextSpaceId: "spc_2",
      expected: "/space/spc_2/ai/models",
    },
    {
      pathname: "/space/spc_1/ai/mcp",
      nextSpaceId: "spc_2",
      expected: "/space/spc_2/ai/mcp",
    },
    {
      pathname: "/space/spc_1/ai/runs",
      nextSpaceId: "spc_2",
      expected: "/space/spc_2/ai/runs",
    },
  ])(
    "resolves $pathname -> $expected",
    ({ pathname, nextSpaceId, expected }) => {
      expect(resolveNextSpaceRoute(pathname, nextSpaceId)).toBe(expected)
    }
  )
})
