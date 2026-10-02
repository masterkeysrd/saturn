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
      "react-hooks/refs": "error",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "error",
      "react-hooks/preserve-manual-memoization": "error",
      "react-hooks/immutability": "error",
      "react-hooks/purity": "error",
    },
    ignores: ["dist/**", ".expo/**", "node_modules/**", "android/**", "ios/**"],
  },
]
