import { defineConfig } from "vitest/config";
import path from "node:path";

// End-to-end tests against a local validator running the real Pump.fun programs and the compiled Deed program.
// Start it first:  wsl bash chain/e2e/validator.sh     then:  npm run test:e2e
export default defineConfig({
  test: {
    environment: "node",
    include: ["chain/e2e/**/*.e2e.test.ts"],
    env: { NEXT_PUBLIC_SOLANA_CLUSTER: "localnet", NEXT_PUBLIC_SOLANA_RPC_URL: "http://127.0.0.1:8899" },
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
