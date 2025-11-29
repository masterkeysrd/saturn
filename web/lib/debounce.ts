import { useState, useEffect } from "react";

/**
 * useDebounce delays updating a value until a specified delay has passed
 * without the value changing.
 * * @param value The value to debounce (e.g., the local input state)
 * @param delay Delay in milliseconds (default 500ms)
 * @returns The debounced value (e.g., the value used for the URL/API call)
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set a timer to update the debounced value
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // CRITICAL: Clean up the previous timer if the value changes (cleanup function).
    // This resets the delay countdown every time 'value' is updated,
    // ensuring the side effect (setDebouncedValue) only runs after the user stops typing.
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]); // Rerun the effect whenever the 'value' or 'delay' changes

  return debouncedValue;
}
