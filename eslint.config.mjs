import { defineConfig, globalIgnores } from "eslint/config";

import tseslint from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";
import nextVitals from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier/flat";

const webNextConfigs = nextVitals.map((config) => ({
  ...config,
  files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
  settings: {
    ...config.settings,
    next: {
      ...config.settings?.next,
      rootDir: ["apps/web/", "./"]
    }
  }
}));

export default defineConfig([
  globalIgnores(["dist/**", "**/.next/**", "coverage/**", "node_modules/**"]),
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ]
    }
  },
  {
    files: ["apps/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@forgetful-fish/game-engine/*", "**/packages/game-engine/src/**"],
              message:
                "Import from @forgetful-fish/game-engine package root only; app code must not depend on game-engine internals."
            }
          ]
        }
      ]
    }
  },
  {
    files: ["apps/server/src/**/*.ts"],
    rules: {
      "max-lines": [
        "error",
        {
          max: 650,
          skipBlankLines: true,
          skipComments: true
        }
      ]
    }
  },
  ...webNextConfigs,
  prettier
]);
