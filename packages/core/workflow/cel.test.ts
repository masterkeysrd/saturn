import { describe, expect, it } from "vitest"
import {
  extractTemplateExpressions,
  extractVariableReferences,
  insertVariableToken,
  isSingleExpressionBlock,
  parseTemplateTokens,
} from "./cel"

describe("workflow CEL template utilities", () => {
  it("parses mixed text and {{ ... }} expressions while preserving quoted braces", () => {
    const res = parseTemplateTokens(
      `Pay {{ input.vendor }} ({{ toJSON({"msg": "a}}b"}) }})`
    )
    expect(res.hasUnclosed).toBe(false)
    expect(res.hasEmptyExpr).toBe(false)
    expect(res.tokens).toHaveLength(5)
    expect(res.tokens[0]).toMatchObject({ type: "text", raw: "Pay " })
    expect(res.tokens[1]).toMatchObject({
      type: "expr",
      expr: "input.vendor",
    })
    expect(res.tokens[2]).toMatchObject({ type: "text", raw: " (" })
    expect(res.tokens[3]).toMatchObject({
      type: "expr",
      expr: `toJSON({"msg": "a}}b"})`,
    })
    expect(res.tokens[4]).toMatchObject({ type: "text", raw: ")" })
  })

  it("flags unclosed and empty expression blocks", () => {
    expect(parseTemplateTokens("hello {{ input.vendor").hasUnclosed).toBe(true)
    expect(parseTemplateTokens("{{   }}").hasEmptyExpr).toBe(true)
  })

  it("extracts expression strings and identifies single-block templates", () => {
    expect(
      extractTemplateExpressions("{{ input.a }} + {{ steps.s1.b }}")
    ).toEqual(["input.a", "steps.s1.b"])

    expect(
      isSingleExpressionBlock("  {{ toCents(steps.extract.amount) }}  ")
    ).toBe(true)
    expect(isSingleExpressionBlock("Total: {{ input.amount }}")).toBe(false)
    expect(isSingleExpressionBlock("plain text")).toBe(false)
  })

  it("inserts variable tokens wrapped or bare depending on cursor context and rawMode", () => {
    const wrapped = insertVariableToken("Pay ", "input.vendor", {
      start: 4,
      end: 4,
    })
    expect(wrapped.value).toBe("Pay {{ input.vendor }}")
    expect(wrapped.cursor).toBe("Pay {{ input.vendor }}".length)

    const inside = insertVariableToken("{{  }}", "steps.x.id", {
      start: 3,
      end: 3,
    })
    expect(inside.value).toBe("{{ steps.x.id }}")

    const raw = insertVariableToken(
      "steps.a.ok && ",
      "input.enabled",
      {
        start: 14,
        end: 14,
      },
      true
    )
    expect(raw.value).toBe("steps.a.ok && input.enabled")
  })

  it("extracts Saturn namespace variable references from templates and raw expressions", () => {
    expect(
      extractVariableReferences(
        "Pay {{ input.vendor }} via {{ sources.acc[0].name }} at {{ space.timezone }}"
      )
    ).toEqual(["input.vendor", "sources.acc", "space.timezone"])

    expect(
      extractVariableReferences(
        "steps.classify.category != 'ignore' && loop.row.amount > 0"
      )
    ).toEqual(["steps.classify.category", "loop.row.amount"])
  })
})
