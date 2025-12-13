import { useState, useEffect } from "react";
import { useDebounce } from "./debounce";

interface SearchFilterOptions {
  delay?: number;
}

export interface SearchFilterAPI {
  value?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Manages the connection between a text input and the URL search param.
 * Handles local state for immediate typing feedback and debouncing for URL updates.
 * * @param currentTerm The current search term read from the URL/API state (e.g., params.search).
 * @param setParams The setter function to update the URL state.
 * @returns Props ready to spread onto an HTML input element or MUI TextField.
 */
export function useSearchFilter<T extends { search: string; page: number }>(
  currentTerm: string | undefined,
  setParams: (updates: Partial<T>) => void,
  options: SearchFilterOptions = {},
): SearchFilterAPI {
  const { delay = 500 } = options;

  // 1. Local State (Immediate UI feedback)
  const [value, setValue] = useState(currentTerm);

  // 2. Sync local state if URL changes externally (e.g. Back button or initial load)
  useEffect(() => {
    // Only update the local value if the URL state is different.
    if (currentTerm !== value) {
      setValue(currentTerm);
    }
    // The dependency array ensures this effect runs when 'currentTerm' changes
    // or when the local 'value' changes, preventing the local input from being
    // overwritten unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTerm]);

  // 3. Debounce the local value
  const debouncedValue = useDebounce(value, delay);

  // 4. Effect: Sync to URL when debounced value changes
  useEffect(() => {
    const term = debouncedValue || "";
    const current = currentTerm || "";

    // Check if the value has actually changed to avoid infinite loops
    if (term !== current) {
      // RULE: Only update the URL if:
      // A. The user cleared the input (term is empty)
      // B. The input meets the minimum length requirement (>= 3 chars)
      if (term.length === 0 || term.length >= 3) {
        // @ts-expect-error - We accept the type risk here as the consuming hook ensures 'page' is present.
        setParams({ search: term, page: 1 });
      }
    }
  }, [debouncedValue, currentTerm, setParams]);

  // Return props ready to spread onto a TextField
  return {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setValue(e.target.value),
  };
}
