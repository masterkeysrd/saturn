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
      "no-restricted-syntax": [
        "error",
        {
          selector:
            'JSXElement[openingElement.name.name="Text"]:not(JSXElement[openingElement.name.name="Text"] JSXElement) > JSXOpeningElement:has(JSXAttribute[name.name="onPress"])',
          message:
            "Do not use standalone <Text onPress> for interactive controls; wrap interactive targets in <TouchableOpacity> or <Pressable> with haptics and >= 44px touch targets.",
        },
      ],
    },
    ignores: ["dist/**", ".expo/**", "node_modules/**", "android/**", "ios/**"],
  },
]
