import { describe, it, expect } from "vitest"
import {
  lightColors,
  darkColors,
  CATEGORICAL_HUES,
  CATEGORICAL_PALETTE,
  CATEGORICAL_HEX_MAP,
  resolveCategoricalHue,
  getCategoricalColor,
  spacing,
  radii,
  concentricRadii,
} from "./index"

describe("@saturn/tokens", () => {
  it("provides matching semantic palette keys for light and dark modes", () => {
    expect(Object.keys(lightColors).sort()).toEqual(
      Object.keys(darkColors).sort()
    )
    expect(lightColors.background).not.toBe(lightColors.surface)
    expect(lightColors.surfaceElevated).toBe("#ffffff")
    expect(lightColors.surfaceElevated).not.toBe(lightColors.background)
    expect(darkColors.background).not.toBe(darkColors.surface)
    expect(lightColors.primary).not.toBe(darkColors.primary)
  })

  it("provides valid hex colors for all JSON syntax tokens in light and dark palettes", () => {
    const syntaxKeys = [
      "syntaxKey",
      "syntaxString",
      "syntaxNumber",
      "syntaxBoolean",
      "syntaxNull",
      "syntaxPunctuation",
    ] as const

    for (const key of syntaxKeys) {
      expect(lightColors[key]).toMatch(/^#[0-9a-f]{6}$/i)
      expect(darkColors[key]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it("exports all 12 perceptually balanced categorical hues plus legacy rose alias", () => {
    expect(CATEGORICAL_HUES).toHaveLength(12)
    expect(CATEGORICAL_PALETTE).toHaveLength(12)

    for (const token of CATEGORICAL_PALETTE) {
      expect(token.hex).toMatch(/^#[0-9a-f]{6}$/i)
      expect(CATEGORICAL_HEX_MAP[token.value]).toBe(token.hex)
      expect(token.light.bar).toMatch(/^#[0-9a-f]{6}$/i)
      expect(token.dark.bar).toMatch(/^#[0-9a-f]{6}$/i)
    }

    expect(CATEGORICAL_HEX_MAP.rose).toBe(CATEGORICAL_HEX_MAP.coral)
    expect(resolveCategoricalHue("rose")).toBe("coral")
    expect(getCategoricalColor("rose").value).toBe("coral")
    expect(getCategoricalColor("unknown").value).toBe("indigo")
  })

  it("maintains strictly monotonic concentric radii and spacing scales", () => {
    expect(concentricRadii.badge).toBeLessThan(concentricRadii.control)
    expect(concentricRadii.control).toBeLessThan(concentricRadii.card)
    expect(concentricRadii.card).toBeLessThan(concentricRadii.sheet)
    expect(radii.sm).toBe(concentricRadii.badge)
    expect(radii.md).toBe(concentricRadii.control)
    expect(radii.lg).toBe(concentricRadii.card)
    expect(radii.xl).toBe(concentricRadii.sheet)
    expect(spacing.xs).toBeLessThan(spacing.sm)
    expect(spacing.sm).toBeLessThan(spacing.md)
    expect(spacing.md).toBeLessThan(spacing.lg)
  })
})
