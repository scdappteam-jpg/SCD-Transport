import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  { files: ["scripts/generate-auth-password-hash.cjs", "src/server/production-relational-mirror.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  globalIgnores([".next/**", "public/legacy/**", "server.cjs", "src/server/legacy-api.cjs"])
]);
