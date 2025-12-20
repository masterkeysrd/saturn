import { getAxios } from '@saturn/sdk/client';
import * as Types from './finance_pb';
import { create, fromJson, type MessageInitShape, toJson } from '@bufbuild/protobuf';

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

