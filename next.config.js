/** @type {import('next').NextConfig} */
const nextConfig = {
  // The /api/chat route reads src/lib/system-prompt.md at runtime via fs.
  // Next.js's output file tracing doesn't pick up arbitrary asset reads, so
  // we include the file explicitly here — otherwise it won't ship to Vercel.
  // In Next.js 14 this lives under `experimental`; it moved to the top level
  // in Next.js 15. We're on 14.2, so keep it nested.
  experimental: {
    outputFileTracingIncludes: {
      '/api/chat': ['./src/lib/system-prompt.md'],
    },
  },
}

module.exports = nextConfig
