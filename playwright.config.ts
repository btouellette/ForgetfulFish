import { defineConfig } from "@playwright/test";

const webPort = 3001;
const serverPort = 4100;

export default defineConfig({
  testDir: "./e2e",
  retries: process.env.CI ? 2 : 0,
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium"
      }
    }
  ],
  webServer: [
    {
      command: "pnpm --filter @forgetful-fish/server exec tsx test/e2e-fixture-server.ts",
      port: serverPort,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(serverPort),
        HOST: "127.0.0.1",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/forgetful_fish_e2e"
      }
    },
    {
      command: `pnpm --filter @forgetful-fish/web dev --hostname 127.0.0.1 --port ${webPort}`,
      port: webPort,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: "test",
        AUTH_URL: `http://127.0.0.1:${webPort}`,
        AUTH_SECRET: "forgetful-fish-e2e-auth-secret",
        AUTH_EMAIL_FROM: "Forgetful Fish <noreply@forgetfulfish.local>",
        AUTH_EMAIL_SERVER: "smtp://127.0.0.1:1025",
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/forgetful_fish_e2e",
        SERVER_API_BASE_URL: `http://127.0.0.1:${serverPort}`
      }
    }
  ]
});
