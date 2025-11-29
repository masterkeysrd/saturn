import { useMemo, useCallback } from "react";
import {
  useSearchParams as useRouterSearchParams,
  type NavigateOptions,
} from "react-router";

type SearchParamValue = string | number | boolean | null | undefined;

// Helper to safely parse values based on the type of the default value
function parseValue(value: string, defaultVal: unknown): unknown {
  if (typeof defaultVal === "number") {
    const parsed = Number(value);
    // If URL has invalid number, fallback to default (or keep as is if you prefer)
    // Here we return the parsed number if valid, otherwise the original string/value
    // (which might be cleaner than returning the default if you want to see the error)
    return isNaN(parsed) ? Number(defaultVal) : parsed;
  }
  if (typeof defaultVal === "boolean") {
    return value === "true";
  }
  return value;
}

/**
 * A fully typed wrapper around React Router's useSearchParams.
 * It uses the provided 'defaults' to infer the correct type (Number, Boolean)
 * for parsing URL strings.
 * * NOTE: You must provide a valid default value (e.g. 1, true) for type inference to work.
 * If you pass 'undefined' or 'null' as a default, it will default to string parsing.
 */
export function useSearchParams<T extends { [K in keyof T]: SearchParamValue }>(
  defaults: T,
) {
  const [searchParams, setSearchParams] = useRouterSearchParams();

  // 1. Read: Merge URL params with Defaults and coerce types
  const query = useMemo(() => {
    // Start with a shallow copy of defaults
    const result: Record<string, unknown> = { ...defaults };

    searchParams.forEach((value, key) => {
      // If this key exists in defaults, we use its type to determine how to parse
      if (Object.prototype.hasOwnProperty.call(defaults, key)) {
        const defaultVal = defaults[key as keyof T];
        result[key] = parseValue(value, defaultVal);
      } else {
        // If it's an extra param not in defaults, treat as string
        result[key] = value;
      }
    });

    return result as T;
  }, [searchParams, defaults]);

  // 2. Write: Typed setter that handles serialization
  const setQuery = useCallback(
    (
      updates: Partial<T> | ((prev: T) => Partial<T>),
      options?: NavigateOptions,
    ) => {
      setSearchParams((prevParams) => {
        const nextParams = new URLSearchParams(prevParams);

        // Resolve updates
        let valuesToUpdate: Partial<T>;

        if (typeof updates === "function") {
          // Reconstruct current state for the callback to ensure consistency
          const current: Record<string, unknown> = { ...defaults };
          prevParams.forEach((val, key) => {
            if (Object.prototype.hasOwnProperty.call(defaults, key)) {
              const defaultVal = defaults[key as keyof T];
              current[key] = parseValue(val, defaultVal);
            } else {
              current[key] = val;
            }
          });
          valuesToUpdate = updates(current as T);
        } else {
          valuesToUpdate = updates;
        }

        // Apply updates
        Object.keys(valuesToUpdate).forEach((key) => {
          const k = key as keyof T;
          const value = valuesToUpdate[k];

          if (value === undefined || value === null || value === "") {
            nextParams.delete(key);
          } else {
            nextParams.set(key, String(value));
          }
        });

        return nextParams;
      }, options);
    },
    [setSearchParams, defaults],
  );

  return [query, setQuery] as const;
}
