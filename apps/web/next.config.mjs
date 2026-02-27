import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authUrl = process.env.AUTH_URL;
const serverApiBaseUrl = process.env.SERVER_API_BASE_URL;
const isProduction = process.env.NODE_ENV === "production";
const effectiveServerApiBaseUrl = serverApiBaseUrl ?? (isProduction ? "" : "http://127.0.0.1:4000");

const allowedDevOrigins = ["http://localhost:3000"];

if (authUrl) {
  allowedDevOrigins.push(authUrl);
}

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isProduction ? {} : { allowedDevOrigins }),
  async rewrites() {
    if (!effectiveServerApiBaseUrl) {
      return [];
    }

    const baseUrl = effectiveServerApiBaseUrl.endsWith("/")
      ? effectiveServerApiBaseUrl.slice(0, -1)
      : effectiveServerApiBaseUrl;

    return {
      beforeFiles: [],
      afterFiles: [
        {
          source: "/api/:path((?!auth(?:/|$)).*)",
          destination: `${baseUrl}/api/:path`
        }
      ],
      fallback: []
    };
  },
  transpilePackages: ["@forgetful-fish/database"],
  outputFileTracingRoot: path.join(__dirname, "../..")
};

export default nextConfig;
