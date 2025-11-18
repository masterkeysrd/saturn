import { CssBaseline } from "@mui/material"
import router from "./router";
import { RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const queryClient = new QueryClient();

function App() {
    return (
        <>
            <QueryClientProvider client={queryClient}>
                <CssBaseline />
                <RouterProvider router={router} />
                <ReactQueryDevtools initialIsOpen={false} />
            </QueryClientProvider>
        </>
    )
}

export default App
