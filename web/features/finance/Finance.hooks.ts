import {
  useMutation,
  useQuery,
  useQueryClient,
  type MutationOpts,
} from "@/lib/react-query";
import {
  createExpense,
  getBudget,
  getCurrency,
  getInsights,
  getTransaction,
  listBudgets,
  listTransactions,
  updateExpense,
  type GetInsightsRequest,
} from "./Finance.api";
import type { Expense, Transaction } from "./Finance.model";

const queryKeys = {
  listBudgets: ["budgets", "list"],
  getBudget: (id: string) => ["budgets", "detail", id],
  getTransaction: (id: string) => ["transactions", "detail", id],
  getCurrency: (code: string) => ["currencies", "detail", code],
  listTransactions: ["transactions", "list"],
  getInsights: (req: GetInsightsRequest) => [
    "insights",
    "start_date",
    req.start_date,
    "end_date",
    req.end_date,
  ],
};

export function useBudgets() {
  return useQuery({
    queryKey: queryKeys.listBudgets,
    queryFn: listBudgets,
  });
}

export function useBudget(id?: string) {
  return useQuery({
    queryKey: queryKeys.getBudget(id!),
    queryFn: () => getBudget(id!),
    enabled: !!id,
  });
}

export function useCurrency(currencyCode?: string) {
  return useQuery({
    queryKey: queryKeys.getCurrency(currencyCode!),
    queryFn: () => getCurrency(currencyCode!),
    enabled: !!currencyCode,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

export function useCreateExpense({
  onSuccess,
  ...rest
}: MutationOpts<Transaction, Expense> = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["expense", "create"],
    mutationFn: createExpense,
    onSuccess: (data, variables, result, context) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.listBudgets });
      queryClient.invalidateQueries({ queryKey: queryKeys.listTransactions });
      onSuccess?.(data, variables, result, context);
    },
    ...rest,
  });
}

export function useUpdateExpense({
  onSuccess,
  ...rest
}: MutationOpts<Transaction, Expense> = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["expense", "update"],
    mutationFn: ({ id, data }: { id: string; data: Expense }) =>
      updateExpense(id, data),
    onSuccess: (data, variables, result, context) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.listBudgets });
      queryClient.invalidateQueries({ queryKey: queryKeys.listTransactions });
      queryClient.invalidateQueries({
        queryKey: queryKeys.getTransaction(data.id!),
      });
      onSuccess?.(data, variables, result, context);
    },
    ...rest,
  });
}

export function useTransaction(id?: string) {
  return useQuery({
    queryKey: queryKeys.getTransaction(id!),
    queryFn: () => getTransaction(id!),
    enabled: !!id,
  });
}

export const useTransactions = () => {
  return useQuery({
    queryKey: queryKeys.listTransactions,
    queryFn: listTransactions,
  });
};

export const useInsights = (req: GetInsightsRequest) => {
  return useQuery({
    queryKey: queryKeys.getInsights(req),
    queryFn: () => getInsights(req),
  });
};
