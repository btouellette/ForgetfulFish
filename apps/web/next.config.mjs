import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authUrl = process.env.AUTH_URL;
const isProduction = process.env.NODE_ENV === "production";

const allowedDevOrigins = ["http://localhost:3000"];

if (authUrl) {
  allowedDevOrigins.push(authUrl);
}

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isProduction ? {} : { allowedDevOrigins }),
  transpilePackages: ["@forgetful-fish/database"],
  outputFileTracingRoot: path.join(__dirname, "../..")
};

export default nextConfig;
