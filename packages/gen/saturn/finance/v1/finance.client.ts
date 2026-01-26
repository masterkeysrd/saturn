import { getAxios } from '@saturn/sdk/client';
import * as Types from './finance_pb';
import { create, fromJson, type MessageInitShape, toJson } from '@bufbuild/protobuf';

/**
 * ListCurrencies returns the list of all supported currencies.
 *
 * @returns Promise<Types.ListCurrenciesResponse>
 */
export async function listCurrencies(): Promise<Types.ListCurrenciesResponse> {
  return getAxios().get(`/api/v1/finance/currencies`
  ).then((resp) => {
    return fromJson(Types.ListCurrenciesResponseSchema, resp.data);
  });
}

/**
 * CreateExchangeRate sets a new exchange rate for a specific currency.
 *
 * The rate represents: 1 Unit of Base Currency = X Units of Target Currency.
 *
 * @param req Types.CreateExchangeRateRequest
 * @returns Promise<Types.ExchangeRate>
 */
export async function createExchangeRate(req: MessageInitShape<typeof Types.CreateExchangeRateRequestSchema>): Promise<Types.ExchangeRate> {
  const msg = create(Types.CreateExchangeRateRequestSchema, req);
  const body = toJson(Types.CreateExchangeRateRequestSchema, msg);

  return getAxios().post(`/api/v1/finance/exchange-rates`
    , body.rate
  ).then((resp) => {
    return fromJson(Types.ExchangeRateSchema, resp.data);
  });
}

/**
 * ListExchangeRates returns all configured exchange rates for the space
 * specified in the request headers.
 *
 * @param req Types.ListExchangeRatesRequest
 * @returns Promise<Types.ListExchangeRatesResponse>
 */
export async function listExchangeRates(req: MessageInitShape<typeof Types.ListExchangeRatesRequestSchema>): Promise<Types.ListExchangeRatesResponse> {
  const msg = create(Types.ListExchangeRatesRequestSchema, req);
  const body = toJson(Types.ListExchangeRatesRequestSchema, msg);

  return getAxios().get(`/api/v1/finance/exchange-rates`
  ).then((resp) => {
    return fromJson(Types.ListExchangeRatesResponseSchema, resp.data);
  });
}

/**
 * GetExchangeRate returns the specific rate for a currency.
 *
 * @param req Types.GetExchangeRateRequest
 * @returns Promise<Types.ExchangeRate>
 */
export async function getExchangeRate(req: MessageInitShape<typeof Types.GetExchangeRateRequestSchema>): Promise<Types.ExchangeRate> {
  const msg = create(Types.GetExchangeRateRequestSchema, req);
  const body = toJson(Types.GetExchangeRateRequestSchema, msg);

  return getAxios().get(`/api/v1/finance/exchange-rates/${body.currencyCode}`
  ).then((resp) => {
    return fromJson(Types.ExchangeRateSchema, resp.data);
  });
}

/**
 * UpdateExchangeRate sets or updates the exchange rate for a specific currency.
 * The rate represents: 1 Unit of Base Currency = X Units of Target Currency.
 *
 * @param req Types.UpdateExchangeRateRequest
 * @returns Promise<Types.ExchangeRate>
 */
export async function updateExchangeRate(req: MessageInitShape<typeof Types.UpdateExchangeRateRequestSchema>): Promise<Types.ExchangeRate> {
  const msg = create(Types.UpdateExchangeRateRequestSchema, req);
  const body = toJson(Types.UpdateExchangeRateRequestSchema, msg);

  return getAxios().patch(`/api/v1/finance/exchange-rates/${body.currencyCode}`
    , body.rate
    , {
      params: {
        updateMask:  body.updateMask,
      }
    }
  ).then((resp) => {
    return fromJson(Types.ExchangeRateSchema, resp.data);
  });
}

/**
 * DeleteExchangeRate removes a custom exchange rate.
 * Effectively disables that currency for the space unless it is re-added.
 *
 * @param req Types.DeleteExchangeRateRequest
 * @returns Promise<void>
 */
export async function deleteExchangeRate(req: MessageInitShape<typeof Types.DeleteExchangeRateRequestSchema>): Promise<void> {
  const msg = create(Types.DeleteExchangeRateRequestSchema, req);
  const body = toJson(Types.DeleteExchangeRateRequestSchema, msg);

  return getAxios().delete(`/api/v1/finance/exchange-rates/${body.currencyCode}`
  ).then(() => {
    return;
  });
}

/**
 * Creates a new budget.
 *
 * @param req Types.CreateBudgetRequest
 * @returns Promise<Types.Budget>
 */
export async function createBudget(req: MessageInitShape<typeof Types.CreateBudgetRequestSchema>): Promise<Types.Budget> {
  const msg = create(Types.CreateBudgetRequestSchema, req);
  const body = toJson(Types.CreateBudgetRequestSchema, msg);

  return getAxios().post(`/api/v1/finance/budgets`
    , body.budget
  ).then((resp) => {
    return fromJson(Types.BudgetSchema, resp.data);
  });
}

/**
 * Lists budgets.
 * Supports filtering by name using the 'search' parameter.
 *
 * @param req Types.ListBudgetsRequest
 * @returns Promise<Types.ListBudgetsResponse>
 */
export async function listBudgets(req: MessageInitShape<typeof Types.ListBudgetsRequestSchema>): Promise<Types.ListBudgetsResponse> {
  const msg = create(Types.ListBudgetsRequestSchema, req);
  const body = toJson(Types.ListBudgetsRequestSchema, msg);

  return getAxios().get(`/api/v1/finance/budgets`
    , {
      params: {
        search:  body.search,
        view:  body.view,
        orderBy:  body.orderBy,
        page:  body.page,
        pageSize:  body.pageSize,
      }
    }
  ).then((resp) => {
    return fromJson(Types.ListBudgetsResponseSchema, resp.data);
  });
}

/**
 * Get information from a specified Budget.
 *
 * @param req Types.GetBudgetRequest
 * @returns Promise<Types.Budget>
 */
export async function getBudget(req: MessageInitShape<typeof Types.GetBudgetRequestSchema>): Promise<Types.Budget> {
  const msg = create(Types.GetBudgetRequestSchema, req);
  const body = toJson(Types.GetBudgetRequestSchema, msg);

  return getAxios().get(`/api/v1/finance/budgets/${body.id}`
    , {
      params: {
        view:  body.view,
      }
    }
  ).then((resp) => {
    return fromJson(Types.BudgetSchema, resp.data);
  });
}

/**
 * Updates a budget's information.
 *
 * @param req Types.UpdateBudgetRequest
 * @returns Promise<Types.Budget>
 */
export async function updateBudget(req: MessageInitShape<typeof Types.UpdateBudgetRequestSchema>): Promise<Types.Budget> {
  const msg = create(Types.UpdateBudgetRequestSchema, req);
  const body = toJson(Types.UpdateBudgetRequestSchema, msg);

  return getAxios().patch(`/api/v1/finance/budgets/${body.id}`
    , body.budget
    , {
      params: {
        updateMask:  body.updateMask,
      }
    }
  ).then((resp) => {
    return fromJson(Types.BudgetSchema, resp.data);
  });
}

/**
 * Deletes a budget.
 *
 * @param req Types.DeleteBudgetRequest
 * @returns Promise<void>
 */
export async function deleteBudget(req: MessageInitShape<typeof Types.DeleteBudgetRequestSchema>): Promise<void> {
  const msg = create(Types.DeleteBudgetRequestSchema, req);
  const body = toJson(Types.DeleteBudgetRequestSchema, msg);

  return getAxios().delete(`/api/v1/finance/budgets/${body.id}`
  ).then(() => {
    return;
  });
}

/**
 * Create a new transaction of expense type.
 *
 * @param req Types.CreateExpenseRequest
 * @returns Promise<Types.Transaction>
 */
export async function createExpense(req: MessageInitShape<typeof Types.CreateExpenseRequestSchema>): Promise<Types.Transaction> {
  const msg = create(Types.CreateExpenseRequestSchema, req);
  const body = toJson(Types.CreateExpenseRequestSchema, msg);

  return getAxios().post(`/api/v1/finance/expenses`
    , body.expense
  ).then((resp) => {
    return fromJson(Types.TransactionSchema, resp.data);
  });
}

/**
 * ListTransactions returns all transactions for the space.
 *
 * @param req Types.ListTransactionsRequest
 * @returns Promise<Types.ListTransactionsResponse>
 */
export async function listTransactions(req: MessageInitShape<typeof Types.ListTransactionsRequestSchema>): Promise<Types.ListTransactionsResponse> {
  const msg = create(Types.ListTransactionsRequestSchema, req);
  const body = toJson(Types.ListTransactionsRequestSchema, msg);

  return getAxios().get(`/api/v1/finance/transactions`
  ).then((resp) => {
    return fromJson(Types.ListTransactionsResponseSchema, resp.data);
  });
}

/**
 * GetSetting retrieves the finance settings for the space.
 *
 * @returns Promise<Types.Setting>
 */
export async function getSetting(): Promise<Types.Setting> {
  return getAxios().get(`/api/v1/finance/setting`
  ).then((resp) => {
    return fromJson(Types.SettingSchema, resp.data);
  });
}

/**
 * UpdateSetting modifies the finance settings for the space.
 *
 * @param req Types.UpdateSettingRequest
 * @returns Promise<Types.Setting>
 */
export async function updateSetting(req: MessageInitShape<typeof Types.UpdateSettingRequestSchema>): Promise<Types.Setting> {
  const msg = create(Types.UpdateSettingRequestSchema, req);
  const body = toJson(Types.UpdateSettingRequestSchema, msg);

  return getAxios().patch(`/api/v1/finance/setting`
    , body.setting
    , {
      params: {
        updateMask:  body.updateMask,
      }
    }
  ).then((resp) => {
    return fromJson(Types.SettingSchema, resp.data);
  });
}

/**
 * ActivateSetting activates the finance settings once properly configured.
 *
 * Once activated, certain fields (like base_currency_code) become immutable.
 *
 * @returns Promise<Types.Setting>
 */
export async function activateSetting(): Promise<Types.Setting> {
  return getAxios().post(`/api/v1/finance/setting:activate`
  ).then((resp) => {
    return fromJson(Types.SettingSchema, resp.data);
  });
}

