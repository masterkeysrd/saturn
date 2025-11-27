import type { RouteObject } from "react-router";

import BudgetsPage from "./pages/BudgetsPage";
import InsightsPage from "./pages/InsightsPage";
import TransactionsPage from "./pages/TransactionsPage";

import { ExpenseFormModal } from "./modals/ExpenseFormModal";
import BudgetFormModal from "./modals/BudgetFormModal";
import DeleteTransactionModal from "./modals/DeleteTransactionModal";

export const Routes: RouteObject = {
  path: "/finance",
  children: [
    {
      path: "insights",
      element: <InsightsPage />,
    },
    {
      path: "budgets",
      element: <BudgetsPage />,
      children: [
        {
          path: "new",
          element: <BudgetFormModal />,
        },
        {
          path: ":id/edit",
          element: <BudgetFormModal />,
        },
      ],
    },
    {
      path: "transactions",
      element: <TransactionsPage />,
      children: [
        {
          path: ":id/delete",
          element: <DeleteTransactionModal />,
        },
        {
          path: "expenses",
          children: [
            {
              path: "new",
              element: <ExpenseFormModal />,
            },
            {
              path: ":id/edit",
              element: <ExpenseFormModal />,
            },
          ],
        },
      ],
    },
  ],
};
