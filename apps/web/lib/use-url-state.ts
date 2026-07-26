import { useCallback, useEffect, useMemo, useRef } from "react"
import { useSearchParams } from "react-router-dom"

/**
 * useUrlState binds a set of key-value states to the URL search parameters.
 * It automatically handles type parsing (strings, numbers, booleans) and default values.
 */
export function useUrlState<
  T extends Record<string, string | number | boolean>,
>(defaultValues: T): [T, (updates: Partial<T>) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const defaultRef = useRef(defaultValues)

  useEffect(() => {
    defaultRef.current = defaultValues
  }, [defaultValues])

  // 1. Resolve current state by reading URL parameters and falling back to default values
  const state = useMemo(() => {
    const nextState = {} as Record<string, string | number | boolean>
    for (const key of Object.keys(defaultValues)) {
      const val = searchParams.get(key)
      if (val === null) {
        nextState[key] = defaultValues[key]
      } else {
        const def = defaultValues[key]
        if (typeof def === "boolean") {
          nextState[key] = val === "true"
        } else if (typeof def === "number") {
          nextState[key] = Number(val)
        } else {
          nextState[key] = val
        }
      }
    }
    return nextState as T
  }, [searchParams, defaultValues])

  // 2. Batched updater function that writes changes to URL (updates parameter or deletes if default)
  const setUrlState = useCallback(
    (updates: Partial<T>) => {
      const nextParams = new URLSearchParams(searchParams)
      const defaults = defaultRef.current
      for (const key of Object.keys(updates)) {
        const val = updates[key]
        const def = defaults[key]

        // Clean up the URL: if a parameter is removed, null, or set back to default, delete it
        if (
          val === undefined ||
          val === null ||
          val === def ||
          val === "_default" ||
          val === ""
        ) {
          nextParams.delete(key)
        } else {
          nextParams.set(key, String(val))
        }
      }
      setSearchParams(nextParams, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  return [state, setUrlState]
}
