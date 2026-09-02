/**
 * Esbuild options for Lambda handler bundles.
 * Keep in sync with `custom.esbuild` in serverless.yml.
 */
export const LAMBDA_ESBUILD_EXTERNAL = [
  "@abstractplay/gameslib",
  "@abstractplay/recranks",
  "@abstractplay/renderer",
  "@aws-sdk/*",
  "@smithy/*",
  "web-push",
  "@sunknudsen/totp",
  "i18next",
];

/** Handler entry modules (unique serverless `handler` paths before the dot). */
export const LAMBDA_HANDLER_ENTRIES = [
  "api/abstractplay.ts",
  "api/testBot.ts",
  "utils/yourturn.ts",
  "utils/bot-outbound.ts",
  "utils/game-projector.ts",
  "api/sockets/connectHandler.ts",
  "api/sockets/disconnectHandler.ts",
  "api/sockets/authHandler.ts",
  "api/sockets/watchGamesHandler.ts",
  "api/sockets/syncPresenceHandler.ts",
  "api/sockets/presenceBroadcaster.ts",
  "api/sockets/messageHandler.ts",
];

export function lambdaEsbuildOptions(entryPoints, outdir) {
  return {
    entryPoints,
    outdir,
    tsconfig: "./tsconfig.json",
    bundle: true,
    sourcemap: false,
    format: "esm",
    outExtension: { ".js": ".mjs" },
    platform: "node",
    target: "node24",
    external: LAMBDA_ESBUILD_EXTERNAL,
    logLevel: "warning",
  };
}
