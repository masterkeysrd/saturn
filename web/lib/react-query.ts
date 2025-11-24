import type {
  UseMutationOptions,
  UseQueryOptions,
} from "@tanstack/react-query";

/**
 * Generic mutation options type for custom hooks
 * Omits mutationFn to be defined by the specific hook implementation
 *
 * @template TData - The data returned by the mutation
 * @template TVariables - The variables/input for the mutation
 * @template TError - The error type (defaults to Error)
 *
 * @example
 * function useCreateExpense(opts?: MutationOps<Transaction, CreateExpenseRequest>) {
 *   return useMutation({ mutationFn: createExpense, ...opts });
 * }
 */
export type MutationOpts<TData, TVariables = void, TError = Error> = Omit<
  UseMutationOptions<TData, TError, TVariables>,
  "mutationFn"
>;

/**
 * Generic query options type for custom hooks
 * Omits queryKey and queryFn to be defined by the specific hook implementation
 *
 * @template TData - The data returned by the query
 * @template TError - The error type (defaults to Error)
 */
export type QueryOpts<TData, TError = Error> = Omit<
  UseQueryOptions<TData, TError>,
  "queryKey" | "queryFn"
>;

export { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
