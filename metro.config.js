// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web build loads a .wasm binary (wa-sqlite) — Metro needs it
// registered as an asset extension or web bundling fails to resolve it.
config.resolver.assetExts.push('wasm');

module.exports = config;
