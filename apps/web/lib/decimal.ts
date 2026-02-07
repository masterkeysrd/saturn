import type { MessageInitShape } from "@bufbuild/protobuf";
import type { DecimalSchema } from "@saturn/gen/google/type/decimal_pb";

type Decimal = MessageInitShape<typeof DecimalSchema>;

/**
 * Converts a protobuf Decimal object to a JavaScript number.
 * @param decimal - The protobuf Decimal object with a string value.
 * @returns A JavaScript number representing the same decimal value, or NaN if the input is invalid.
 */
function fromPbDecimal(decimal?: Decimal): number {
  if (!decimal) {
    return NaN;
  }

  const value = decimal.value ?? "0";
  return Number.parseFloat(value);
}

/**
 * Decimal utility functions.
 */
export const decimal = {
  /**
   * Converts a protobuf Decimal object to a JavaScript number.
   * @param decimal - The protobuf Decimal object with a string value.
   * @returns A JavaScript number representing the same decimal value, or NaN if the input is invalid.
   */
  fromPbDecimal,
} as const;
