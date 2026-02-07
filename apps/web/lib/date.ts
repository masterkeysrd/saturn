import type { MessageInitShape } from "@bufbuild/protobuf";
import type { DateSchema } from "@saturn/gen/google/type/date_pb";

type PbDate = MessageInitShape<typeof DateSchema>;

/**
 * Converts a protobuf date object to a JavaScript Date object.
 * @param pbDate - The protobuf date object with year, month, and day.
 * @returns A JavaScript Date object representing the same date.
 */
function fromPbDate(pbDate?: PbDate): Date {
  if (!pbDate) {
    return new Date(NaN);
  }

  // return new Date(pbDate.year, pbDate.month - 1, pbDate.day);
  const year = pbDate.year ?? 0;
  const month = (pbDate.month ?? 1) - 1; // JavaScript months are 0-based
  const day = pbDate.day ?? 1;

  return new Date(year, month, day);
}

/**
 * Date utility functions.
 */
export const date = {
  /**
   * Converts a protobuf date object to a JavaScript Date object.
   * @param pbDate - The protobuf date object with year, month, and day.
   * @returns A JavaScript Date object representing the same date.
   */
  fromPbDate,
} as const;
