import {
  useMutation,
  useQuery,
  useQueryClient,
  type MutationOpts,
} from "@/lib/react-query";
import {
  createBudget,
  createExpense,
  deleteTransaction,
  getBudget,
  getCurrencies,
  getCurrency,
  getInsights,
  getTransaction,
  listBudgets,
  listTransactions,
  updateBudget,
  updateExpense,
  type GetInsightsRequest,
} from "./Finance.api";
import type {
  Budget,
  Expense,
  Transaction,
  UpdateBudgetParams,
  UpdateExpenseParams,
} from "./Finance.model";
import type { MutationOptions } from "@tanstack/react-query";

const queryKeys = {
  listBudgets: ["budgets", "list"],
  getBudget: (id: string) => ["budgets", "detail", id],
  getTransaction: (id: string) => ["transactions", "detail", id],
  listCurrencies: ["currencies", "list"],
  getCurrency: (code: string) => ["currencies", "detail", code],
  listTransactions: ["transactions", "list"],
  getInsights: (req: GetInsightsRequest) => [
    "insights",
    "start_date",
    req.start_date,
    "end_date",
    req.end_date,
  ],
} as const;

export function useBudgets() {
  return useQuery({
    queryKey: queryKeys.listBudgets,
    queryFn: listBudgets,
  });
}

export function useCreateBudget({
  onSuccess,
  ...rest
}: MutationOpts<Budget, Budget> = {}) {
  return useMutation({
    mutationKey: ["budget", "create"],
    mutationFn: createBudget,
    onSuccess: async (data, variables, result, context) => {
      await Promise.all([
        context.client.invalidateQueries({ queryKey: queryKeys.listBudgets }),
        context.client.invalidateQueries({ queryKey: ["insights"] }),
      ]);
      onSuccess?.(data, variables, result, context);
    },
    ...rest,
  });
}

export function useUpdateBudget({
  onSuccess,
  ...rest
}: MutationOpts<Budget, Budget> = {}) {
  return useMutation({
    mutationKey: ["budget", "update"],
    mutationFn: ({
      id,
      data,
      params,
    }: {
      id: string;
      data: Budget;
      params: UpdateBudgetParams;
    }) => updateBudget(id, data, params),
    onSuccess: async (data, variables, result, context) => {
      await Promise.all([
        context.client.invalidateQueries({ queryKey: queryKeys.listBudgets }),
        context.client.invalidateQueries({
          queryKey: queryKeys.listTransactions,
        }),
        context.client.invalidateQueries({
          queryKey: queryKeys.getBudget(data.id!),
        }),
        context.client.invalidateQueries({ queryKey: ["insights"] }),
      ]);
      onSuccess?.(data, variables, result, context);
    },
    ...rest,
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

export function useCurrencies() {
  return useQuery({
    queryKey: queryKeys.listCurrencies,
    queryFn: () => getCurrencies(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

export function useCreateExpense({
  onSuccess,
  ...rest
}: MutationOpts<Transaction, Expense> = {}) {
  return useMutation({
    mutationKey: ["expense", "create"],
    mutationFn: createExpense,
    onSuccess: async (data, variables, result, context) => {
      await Promise.all([
        context.client.invalidateQueries({ queryKey: queryKeys.listBudgets }),
        context.client.invalidateQueries({
          queryKey: queryKeys.listTransactions,
        }),
        context.client.invalidateQueries({ queryKey: ["insights"] }),
      ]);
      onSuccess?.(data, variables, result, context);
    },
    ...rest,
  });
}

export function useUpdateExpense({
  onSuccess,
  ...rest
}: MutationOpts<Transaction, Expense> = {}) {
  return useMutation({
    mutationKey: ["expense", "update"],
    mutationFn: ({
      id,
      data,
      params,
    }: {
      id: string;
      data: Expense;
      params: UpdateExpenseParams;
    }) => updateExpense(id, data, params),
    onSuccess: async (data, variables, result, context) => {
      const client = context.client;
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.listBudgets }),
        client.invalidateQueries({
          queryKey: queryKeys.listTransactions,
        }),
        client.invalidateQueries({
          queryKey: queryKeys.getTransaction(data.id!),
        }),
        client.invalidateQueries({ queryKey: ["insights"] }),
      ]);
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

export function useDeleteTransaction({
  onSuccess,
  ...rest
}: MutationOptions<void, string, string> = {}) {
  const queryClient = useQueryClient();

  return useMutation<void, string, string>({
    mutationFn: (id) => deleteTransaction(id),
    onSuccess: async (data, variables, result, context) => {
      const transactionKey = queryKeys.getTransaction(variables);
      await queryClient.cancelQueries({ queryKey: transactionKey });
      queryClient.removeQueries({ queryKey: transactionKey });

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["transactions"],
          predicate: (query) => {
            const isCurrentTransaction =
              JSON.stringify(query.queryKey) === JSON.stringify(transactionKey);
            return !isCurrentTransaction;
          },
        }),
        queryClient.invalidateQueries({ queryKey: ["insights"] }),
      ]);

      onSuccess?.(data, variables, result, context);
    },
    ...rest,
  });
}

export const useInsights = (req: GetInsightsRequest) => {
  return useQuery({
    queryKey: queryKeys.getInsights(req),
    queryFn: () => getInsights(req),
  });
};
