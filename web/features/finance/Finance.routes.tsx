import type { RouteObject } from "react-router";
import InsightsPage from "./pages/InsightsPage";
import TransactionsPage from "./pages/TransactionsPage";
import { ExpenseFormModal } from "./modals/ExpenseFormModal";

export const Routes: RouteObject = {
  path: "/finance",
  children: [
    {
      path: "insights",
      element: <InsightsPage />,
    },
    {
      path: "transactions",
      element: <TransactionsPage />,
      children: [
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
