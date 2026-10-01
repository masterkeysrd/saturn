const expoConfig = require("eslint-config-expo/flat")

module.exports = [
  ...expoConfig,
  {
    settings: {
      react: {
        version: "19.2",
      },
    },
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
    },
    ignores: ["dist/**", ".expo/**", "node_modules/**", "android/**", "ios/**"],
  },
]
