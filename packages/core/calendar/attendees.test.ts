import { describe, it, expect } from "vitest"
import { findSelfAttendee } from "./attendees"

describe("findSelfAttendee", () => {
  const attendees = [
    {
      email: "organizer@example.com",
      isOrganizer: true,
      responseStatus: "ACCEPTED",
    },
    {
      email: "Alice@Company.com",
      isOrganizer: false,
      responseStatus: "TENTATIVE",
    },
    {
      email: "personal@gmail.com",
      isOrganizer: false,
      responseStatus: "NEEDS_ACTION",
    },
  ]

  it("matches attendee email case-insensitively against user and connected emails", () => {
    expect(
      findSelfAttendee(attendees, ["nobody@example.com", "alice@company.com"])
    ).toEqual(attendees[1])
    expect(findSelfAttendee(attendees, ["  PERSONAL@GMAIL.COM  "])).toEqual(
      attendees[2]
    )
  })

  it("returns undefined when no attendee matches or inputs are empty", () => {
    expect(findSelfAttendee(attendees, ["other@example.com"])).toBeUndefined()
    expect(findSelfAttendee(attendees, [])).toBeUndefined()
    expect(findSelfAttendee([], ["alice@company.com"])).toBeUndefined()
    expect(findSelfAttendee(undefined, [null, undefined, ""])).toBeUndefined()
  })
})
