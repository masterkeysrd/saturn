import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter } from "react-router-dom"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { AuthProvider } from "@/features/auth/auth-provider.tsx"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ActiveSpaceProvider } from "@/features/space/use-space"

// Initialize the global React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Prevents aggressive refetching on focus in dev mode
      retry: 1, // Number of retry attempts on request failure
    },
  },
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ActiveSpaceProvider>
            <BrowserRouter>
              <TooltipProvider>
                <App />
              </TooltipProvider>
            </BrowserRouter>
          </ActiveSpaceProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>
)
