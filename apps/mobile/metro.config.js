// Expo configures Metro for npm workspaces automatically: it watches the
// repository root and resolves the shared @moneylens/* packages from source.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
