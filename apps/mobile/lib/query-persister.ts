import AsyncStorage from "@react-native-async-storage/async-storage"
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister"
import { QueryClient, onlineManager } from "@tanstack/react-query"
import NetInfo from "@react-native-community/netinfo"
import { Platform } from "react-native"

// 1. Setup onlineManager with NetInfo on native platforms
if (Platform.OS !== "web") {
  onlineManager.setEventListener((setOnline) => {
    return NetInfo.addEventListener((state) => {
      const isOnline = Boolean(
        state.isConnected &&
        (state.isInternetReachable === null || state.isInternetReachable)
      )
      setOnline(isOnline)
    })
  })
}

// 2. Global query client with offline-aware caching rules
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount) => {
        // Pause retries when offline
        if (!onlineManager.isOnline()) {
          return false
        }
        return failureCount < 2
      },
      staleTime: 1000 * 60 * 5, // 5 minutes fresh
      gcTime: 1000 * 60 * 60 * 24, // 24 hours in cache
    },
  },
})

// 3. AsyncStorage persister for 24h offline cache
export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "SATURN_QUERY_OFFLINE_CACHE",
  throttleTime: 1000,
})

// 4. Persistence options for PersistQueryClientProvider
export const persistOptions = {
  persister: asyncStoragePersister,
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  buster: "saturn-mobile-v1",
  dehydrateOptions: {
    shouldDehydrateQuery: (query: {
      state: { status: string }
      queryKey: unknown
    }) => {
      // Only persist successful queries to avoid saving error state to disk
      if (query.state.status !== "success") return false

      // Prevent caching auth tokens or sensitive credentials
      const queryKey = query.queryKey
      if (Array.isArray(queryKey)) {
        const firstKey = String(queryKey[0] ?? "")
        if (
          firstKey.includes("auth") ||
          firstKey.includes("token") ||
          firstKey.includes("password")
        ) {
          return false
        }
      }
      return true
    },
  },
}
