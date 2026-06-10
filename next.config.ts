import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Expose the single-user identity vars to the client bundle so `lib/config.ts`
  // resolves to the SAME value on server and client. Without this, non-public
  // env vars are undefined in the browser → config falls back → hydration
  // mismatch (server "Intern" vs client fallback "Student").
  // Fallbacks mirror lib/config.ts so an unset var inlines a consistent value.
  env: {
    USER_DISPLAY_NAME: process.env.USER_DISPLAY_NAME ?? 'Charlie',
    USER_LOCATION: process.env.USER_LOCATION ?? 'Columbus, OH',
    USER_ROLE: process.env.USER_ROLE ?? 'Student',
    USER_TIMEZONE: process.env.USER_TIMEZONE ?? 'America/Chicago',
    USER_ID: process.env.USER_ID ?? 'user',
  },
};

export default nextConfig;
