import { fileURLToPath, URL } from "node:url";
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  resolve: {
    alias: {
      "@/layout": fileURLToPath(new URL("./layout", import.meta.url)),
      "@/lib": fileURLToPath(new URL("./lib", import.meta.url)),
      "@/components": fileURLToPath(new URL("./components", import.meta.url)),
    },
  },
})
