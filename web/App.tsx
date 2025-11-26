import { CssBaseline, ThemeProvider } from "@mui/material";
import { RouterProvider } from "react-router";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterLuxon } from "@mui/x-date-pickers/AdapterLuxon";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { SnackbarProvider } from "notistack";

import theme from "./theme";
import router from "./router";

const queryClient = new QueryClient();

function App() {
  return (
    <>
      <ThemeProvider theme={theme}>
        <SnackbarProvider
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "right",
          }}
        >
          <LocalizationProvider dateAdapter={AdapterLuxon}>
            <QueryClientProvider client={queryClient}>
              <CssBaseline />
              <RouterProvider router={router} />
              <ReactQueryDevtools initialIsOpen={false} />
            </QueryClientProvider>
          </LocalizationProvider>
        </SnackbarProvider>
      </ThemeProvider>
    </>
  );
}

export default App;
