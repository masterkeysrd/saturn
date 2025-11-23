import type { RouteObject } from "react-router";
import InsightsPage from "./pages/InsightsPage";
import TransactionsPage from "./pages/TransactionsPage";

export const Routes: RouteObject = {
    path: '/finance',
    children: [
        {
            path: 'insights',
            element: <InsightsPage />
        },
        {
            path: 'transactions',
            element: <TransactionsPage />
        }
    ],
};
