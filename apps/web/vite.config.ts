import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // Group charts and D3 mathematical utilities (heavy)
            if (id.includes("recharts") || id.includes("d3")) {
              return "vendor-charts"
            }
            // Group SVG icons (hundreds of icons take up a lot of chunk space)
            if (id.includes("lucide-react")) {
              return "vendor-icons"
            }
            // Group React DOM specifically
            if (id.includes("react-dom")) {
              return "vendor-react-dom"
            }
            // Group React Query libraries
            if (id.includes("@tanstack") || id.includes("react-query")) {
              return "vendor-query"
            }
            // Group all other third-party core modules (React, Router, etc.)
            return "vendor"
          }
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
})
