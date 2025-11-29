/**
 * A utility class for safely constructing URL query strings from a flat object
 * using the URLSearchParams mechanism for automatic encoding.
 * * It supports a static factory method (Query.build) and instance methods
 * for conversion (toString/toQuery).
 */
export class URLQuery {
  // Internal property to hold the constructed parameters
  private params: URLSearchParams;

  // The constructor is private to force usage of the static build method
  private constructor(params: Record<string, unknown> | undefined = {}) {
    this.params = new URLSearchParams();
    this.initialize(params);
  }

  /**
   * Internal method to process the input object and populate URLSearchParams.
   */
  private initialize(params: Record<string, unknown>): void {
    // Iterate over object keys and append them to URLSearchParams
    for (const key in params) {
      // Skip null or undefined values
      const value = params[key];
      if (value === null || value === undefined) {
        continue;
      }

      // Append the key-value pair. URLSearchParams automatically handles encoding.
      // We explicitly cast to string for safety, although URLSearchParams does this internally.
      this.params.append(key, String(value));
    }
  }

  /**
   * Static factory method to create a new Query instance.
   * * The type T is used to accept any object, including interfaces
   * that only define specific properties (like UpdateBudgetParams).
   * * @param params The object containing key-value pairs to convert to a query string.
   * @returns A new Query instance.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static build<T extends Record<string, any>>(params: T): URLQuery {
    const clean: Record<string, unknown> = {};
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v) {
          clean[k] = v;
        }
      });
    }

    return new URLQuery(clean);
  }

  /**
   * Generates the complete query string, without including the leading '?'.
   * * @returns The query string without starting with '?'.
   */
  toString(): string {
    return this.params.toString();
  }

  /**
   * Generates the complete query string, including the leading '?' if it contains content.
   * * @returns The query string starting with '?', or an empty string if no parameters are present.
   */
  toQuery(): string {
    const queryString = this.toString();

    // Only return the '?' prefix if there is actual content
    return queryString ? `?${queryString}` : "";
  }
}
