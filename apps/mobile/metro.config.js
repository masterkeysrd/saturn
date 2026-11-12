const { getDefaultConfig } = require("expo/metro-config")
const path = require("path")

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, "../..")

const config = getDefaultConfig(projectRoot)

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot]

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
]

// 3. Exclude test files and test utilities from Metro bundling
config.resolver.blockList = [
  /__tests__\/.*/,
  /.*\.test\.[jt]sx?$/,
  /.*\.spec\.[jt]sx?$/,
]

module.exports = config
