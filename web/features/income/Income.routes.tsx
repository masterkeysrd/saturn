import { RouteObject } from "react-router";

import Income from "./Income";
import IncomeDetails from "./IncomeDetails";
import IncomeUpdate from "./IncomeUpdate";

const Routes: RouteObject = {
  path: "income",
  element: <Income />,
  children: [
    {
      path: "new",
      element: <IncomeUpdate />,
    },
    {
      path: ":id",
      children: [
        {
          index: true,
          element: <IncomeDetails />,
        },
        {
          path: "edit",
          element: <IncomeUpdate />,
        },
      ],
    },
  ],
};

export default Routes;
