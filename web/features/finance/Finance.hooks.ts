import {
  useMutation,
  useQuery,
  useQueryClient,
  type MutationOpts,
} from "@/lib/react-query";
import {
  createBudget,
  createExpense,
  deleteBudget,
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
  ListBudgetParams,
  ListTransactionsParams,
  Transaction,
  UpdateBudgetParams,
  UpdateExpenseParams,
} from "./Finance.model";
import type { MutationOptions } from "@tanstack/react-query";

const queryKeys = {
  listBudgets: (params: ListBudgetParams = {}) => [
    "budgets",
    "list",
    { ...params },
  ],
  getBudget: (id: string) => ["budgets", "detail", id],
  listCurrencies: ["currencies", "list"],
  getCurrency: (code: string) => ["currencies", "detail", code],
  getTransaction: (id: string) => ["transactions", "detail", id],
  listTransactions: (params: ListTransactionsParams) => [
    "transactions",
    "list",
    { ...params },
  ],
  getInsights: (req: GetInsightsRequest) => [
    "insights",
    "start_date",
    req.start_date,
    "end_date",
    req.end_date,
  ],
} as const;

export function useBudgets(params: ListBudgetParams) {
  return useQuery({
    queryKey: queryKeys.listBudgets(params),
    queryFn: () => listBudgets(params),
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
        context.client.invalidateQueries({ queryKey: ["budgets", "list"] }),
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
        context.client.invalidateQueries({ queryKey: ["budgets", "list"] }),
        context.client.invalidateQueries({
          queryKey: ["transactions", "list"],
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

export function useDeleteBudget({
  onSuccess,
  ...rest
}: MutationOptions<void, string, string> = {}) {
  return useMutation<void, string, string>({
    mutationFn: (id) => deleteBudget(id),
    onSuccess: async (data, variables, result, context) => {
      const budgetKey = queryKeys.getBudget(variables);
      await context.client.cancelQueries({ queryKey: budgetKey });
      context.client.removeQueries({ queryKey: budgetKey });

      await Promise.all([
        context.client.invalidateQueries({
          queryKey: ["budgets"],
          predicate: (query) => {
            const isCurrentTransaction =
              JSON.stringify(query.queryKey) === JSON.stringify(budgetKey);
            return !isCurrentTransaction;
          },
        }),
        context.client.invalidateQueries({ queryKey: ["insights"] }),
      ]);

      onSuccess?.(data, variables, result, context);
    },
    ...rest,
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
        context.client.invalidateQueries({ queryKey: ["budgets", "list"] }),
        context.client.invalidateQueries({
          queryKey: ["transactions", "list"],
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
        client.invalidateQueries({ queryKey: ["budgets", "list"] }),
        client.invalidateQueries({
          queryKey: ["transactions", "list"],
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

export const useTransactions = (params: ListTransactionsParams) => {
  return useQuery({
    queryKey: queryKeys.listTransactions(params),
    queryFn: () => listTransactions(params),
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
