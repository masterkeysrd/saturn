import { forwardRef, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  RouterProvider,
  Link as RouterLink,
  LinkProps as RouterLinkProps,
} from "react-router";
import router from "./router";

// Import Roboto font
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import { createTheme, CssBaseline, ThemeProvider } from "@mui/material";
import { LinkProps } from "@mui/material/Link";

const LinkBehavior = forwardRef<
  HTMLAnchorElement,
  Omit<RouterLinkProps, "to"> & { href: RouterLinkProps["to"] }
>((props, ref) => {
  const { href, ...other } = props;
  return <RouterLink ref={ref} to={href} {...other} />;
});

const theme = createTheme({
  cssVariables: true,
  palette: {
    background: {
      default: "#f0f0f0",
    },
  },
  components: {
    MuiLink: {
      defaultProps: {
        component: LinkBehavior,
      } as LinkProps,
    },
    MuiButtonBase: {
      defaultProps: {
        LinkComponent: LinkBehavior,
      },
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
);
