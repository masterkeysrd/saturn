import {
  useQueryClient,
  useMutation,
  type QueryKey,
} from "@tanstack/react-query"

export interface PatchOptions<TData, TVariables> {
  entityKey: string
  mutationFn: (variables: TVariables) => Promise<TData>
  buildVariables: (
    id: string,
    payload: Partial<TData>,
    dirtyPaths: string[],
    expectedVersion?: number
  ) => TVariables
  onErrorToast?: (error: Error) => void
}

export interface PerformPatchParams<TData> {
  id: string
  payload: Partial<TData>
  dirtyFields: Record<string, boolean | undefined | unknown>
  expectedVersion?: number
}

export function usePatch<
  TData extends { id: string; version?: number },
  TVariables,
>(options: PatchOptions<TData, TVariables>) {
  const queryClient = useQueryClient()
  const { entityKey, mutationFn, buildVariables, onErrorToast } = options

  return useMutation<
    TData,
    Error,
    PerformPatchParams<TData>,
    { previousItem?: TData; previousLists?: [QueryKey, unknown][] }
  >({
    mutationFn: async ({ id, payload, dirtyFields, expectedVersion }) => {
      const dirtyPaths = Object.keys(dirtyFields).filter((key) =>
        Boolean(dirtyFields[key])
      )
      if (dirtyPaths.length === 0) {
        throw new Error("No fields modified")
      }
      const vars = buildVariables(id, payload, dirtyPaths, expectedVersion)
      return mutationFn(vars)
    },

    onMutate: async ({ id, payload }) => {
      // 1. Cancel ongoing queries for this entity family
      await queryClient.cancelQueries({ queryKey: [entityKey] })

      // 2. Snapshot current state for potential rollback
      const singleKey = [entityKey, id]
      const previousItem = queryClient.getQueryData<TData>(singleKey)
      const previousLists = queryClient.getQueriesData<unknown>({
        queryKey: [entityKey],
      })

      // 3. Optimistically update single item cache
      if (previousItem) {
        queryClient.setQueryData<TData>(singleKey, {
          ...previousItem,
          ...payload,
        })
      }

      // 4. Optimistically update list & paginated caches
      queryClient.setQueriesData<unknown>(
        { queryKey: [entityKey] },
        (oldData: unknown) => {
          if (!oldData) return oldData

          if (
            typeof oldData === "object" &&
            oldData !== null &&
            "items" in oldData &&
            Array.isArray((oldData as { items: unknown[] }).items)
          ) {
            const container = oldData as { items: TData[] }
            return {
              ...container,
              items: container.items.map((item: TData) =>
                item.id === id ? { ...item, ...payload } : item
              ),
            }
          }

          if (Array.isArray(oldData)) {
            return oldData.map((item: TData) =>
              item.id === id ? { ...item, ...payload } : item
            )
          }

          return oldData
        }
      )

      return { previousItem, previousLists }
    },

    onError: (err, { id }, context) => {
      const singleKey = [entityKey, id]

      // Rollback single item cache
      if (context?.previousItem) {
        queryClient.setQueryData(singleKey, context.previousItem)
      }

      // Rollback list caches
      if (context?.previousLists) {
        context.previousLists.forEach(([key, data]) => {
          queryClient.setQueryData(key, data)
        })
      }

      if (onErrorToast) {
        onErrorToast(err)
      }
    },

    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: [entityKey, id] })
      queryClient.invalidateQueries({ queryKey: [entityKey] })
    },
  })
}
