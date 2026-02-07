import type { MessageInitShape } from "@bufbuild/protobuf";
import type { DateSchema } from "@saturn/gen/google/type/date_pb";
import { DateTime } from "luxon";

type PbDate = MessageInitShape<typeof DateSchema>;

/**
 * Converts a protobuf date object to a Luxon DateTime object.
 * @param pbDate - The protobuf date object with year, month, and day.
 * @returns A Luxon DateTime object representing the same date.
 */
function fromPbDate(pbDate?: PbDate): DateTime {
  if (!pbDate) {
    return DateTime.fromMillis(0);
  }

  const year = pbDate.year ?? 0;
  const month = pbDate.month ?? 1;
  const day = pbDate.day ?? 1;

  return DateTime.fromObject({ year, month, day });
}

/**
 * Converts a Luxon DateTime object to a protobuf date object.
 * @param dateTime - The Luxon DateTime object.
 * @returns A protobuf date object representing the same date.
 */
function toPbDate(dateTime: DateTime): PbDate {
  return {
    year: dateTime.year,
    month: dateTime.month,
    day: dateTime.day,
  };
}

/**
 * Date utility functions.
 */
export const date = {
  /**
   * Converts a Luxon DateTime object to a protobuf date object.
   */
  toPbDate,
  /**
   * Converts a protobuf date object to a Luxon DateTime object.
   */
  fromPbDate,
} as const;
