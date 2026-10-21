const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// packages/shared uses explicit `.ts` import specifiers (shared with Deno); Metro resolves them as-is.
module.exports = withNativeWind(config, { input: './global.css' });
