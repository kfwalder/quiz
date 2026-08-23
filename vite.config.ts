// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { networkInterfaces } from "node:os";

function getLocalNetworkUrl() {
  const address = Object.values(networkInterfaces())
    .flat()
    .find((network) => network?.family === "IPv4" && !network.internal)?.address;
  return address ? `http://${address}:8080` : "";
}

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  vite: {
    define: {
      __LOCAL_NETWORK_URL__: JSON.stringify(getLocalNetworkUrl()),
    },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
