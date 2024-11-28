import React from "react";
import { RouteObject } from "react-router";
import Layout from "./Layout";
import SignIn from "./SignIn";
import ForgotPassword from "./ForgotPassword";
import SignUp from "./SignUp";

const AuthRoutes: RouteObject = {
  path: "",
  element: <Layout />,
  children: [
    {
      path: "sign-in",
      element: <SignIn />,
    },
    {
      path: "sign-up",
      element: <SignUp />,
    },
    {
      path: "forgot-password",
      element: <ForgotPassword />,
    },
  ],
};

export default AuthRoutes;
