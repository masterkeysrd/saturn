import { describe, expect, it } from "vitest"
import { CRON_PRESETS, isValidCronExpression, summarizeCron } from "./cron"

describe("workflow cron utilities", () => {
  it("validates all built-in presets", () => {
    for (const preset of CRON_PRESETS) {
      expect(isValidCronExpression(preset.cron)).toBe(true)
    }
  })

  it("validates standard 5-field expressions and rejects malformed ones", () => {
    expect(isValidCronExpression("0 9 * * 1-5")).toBe(true)
    expect(isValidCronExpression("*/10 8-18 * 1,6,12 1,3,5")).toBe(true)
    expect(isValidCronExpression("@daily")).toBe(true)

    expect(isValidCronExpression("")).toBe(false)
    expect(isValidCronExpression("* * *")).toBe(false)
    expect(isValidCronExpression("61 * * * *")).toBe(false)
    expect(isValidCronExpression("0 25 * * *")).toBe(false)
    expect(isValidCronExpression("0 9 32 * *")).toBe(false)
    expect(isValidCronExpression("0 9 * 13 *")).toBe(false)
    expect(isValidCronExpression("0 9 * * 8")).toBe(false)
  })

  it("formats human-readable cron summaries with optional timezone", () => {
    expect(summarizeCron("*/15 * * * *")).toBe("Every 15 minutes")
    expect(summarizeCron("0 * * * *")).toBe("Every hour at :00")
    expect(summarizeCron("0 9 * * *", "America/New_York")).toBe(
      "Every day at 09:00 (America/New_York)"
    )
    expect(summarizeCron("30 14 * * 1-5", "UTC")).toBe(
      "Weekdays at 14:30 (UTC)"
    )
    expect(summarizeCron("0 8 1 * *")).toBe("Monthly on day 1 at 08:00")
    expect(summarizeCron("0 9 * * 1")).toBe("Every Monday at 09:00")
    expect(summarizeCron("invalid")).toBe("Invalid cron expression")
  })
})
