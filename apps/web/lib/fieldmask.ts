/**
 * Utility class to generate a Field Mask string based on the dirty state of a form.
 * This is crucial for enabling HTTP PATCH requests, telling the backend exactly
 * which fields were updated, ensuring domain integrity and efficiency.
 */
export class FieldMask {
  /**
   * @private The flattened list of field paths (e.g., ["name", "address.city"]).
   */
  private paths: string[];

  /**
   * @private Constructor is private to enforce using the static factory method.
   * @param paths - The processed list of dot-separated field paths.
   */
  private constructor(paths: string[]) {
    this.paths = paths;
  }

  /**
   * Factory method to create a FieldMask from React Hook Form's 'dirtyFields' state.
   * It recursively flattens the nested dirty fields object into a single array of paths.
   * @param dirtyFields - The object returned by RHF's formState.dirtyFields.
   * @returns A new FieldMask instance.
   */
  public static FromFormState(dirtyFields: Record<string, unknown>): FieldMask {
    const paths = this.extractDirtyFieldsRecursive(dirtyFields);
    return new FieldMask(paths);
  }

  /**
   * Converts the mask into the comma-separated string required by the API.
   * Example output: "name,address.city"
   * @returns The comma-separated string of updated field paths.
   */
  public toString(): string {
    return this.paths.join(",");
  }

  /**
   * Checks if any fields were actually updated, indicating if a PATCH request is necessary.
   * @returns True if the paths array is not empty.
   */
  public hasChanges(): boolean {
    return this.paths.length > 0;
  }

  /**
   * @private Recursively traverses the dirtyFields object to flatten nested paths.
   * This handles complex structures where RHF reports { address: { city: true } }.
   * @param dirtyFields - The current level of the dirty fields object.
   * @param prefix - The dot-separated path prefix for the current recursion level (e.g., "address").
   * @returns An array of flattened string paths.
   */
  private static extractDirtyFieldsRecursive(
    dirtyFields: Record<string, unknown>,
    prefix = "",
  ): string[] {
    return Object.keys(dirtyFields).reduce((acc, key) => {
      const value = dirtyFields[key];
      const path = prefix ? `${prefix}.${key}` : key;

      // If RHF returns 'true', it means this primitive field was touched.
      if (value === true) {
        acc.push(path);
      }
      // If RHF returns an object, it means the field is nested and we must recurse.
      else if (typeof value === "object" && value !== null) {
        acc.push(
          ...this.extractDirtyFieldsRecursive(
            value as Record<string, unknown>,
            path,
          ),
        );
      }

      return acc;
    }, [] as string[]);
  }
}
