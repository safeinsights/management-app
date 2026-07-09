import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'
import path from 'node:path'

const isDev = Boolean(process.env.CI || process.env.NODE_ENV === 'development')

// When E2E_FAKE_CLERK is set, swap the real Clerk SDK for the in-app fake under
// src/lib/clerk-fake so e2e tests run with zero Clerk network. Production builds
// (flag unset) are untouched. See src/lib/clerk-fake/README intent in server.ts.
const fakeClerk = Boolean(process.env.E2E_FAKE_CLERK)

// Turbopack's persistent filesystem cache for `next build` is experimental (opt-in) in
// Next 16, so it's gated behind TURBOPACK_FS_CACHE and only turned on for the CI e2e build
// (see .github/workflows/checks.yml), never for the production deploy build. It writes to
// .next/cache, which CI persists across runs to make incremental rebuilds much faster.
// A corrupt cache fails loudly at build time (a red build, never a false-green test run). The
// rarer, quieter risk is a stale build if invalidation ever missed a change; content-hash change
// detection plus a cache key that hashes every source file make this unlikely, but if a build is
// ever suspected stale, bust the cache by bumping the tpc token in the workflow cache key.
const turbopackFsCache = Boolean(process.env.TURBOPACK_FS_CACHE)

const securityHeaders = [
    // Clickjacking protection (SIINFOSEC-470, ZAP-10020).
    // We never want this app embedded in a frame; DENY is stricter than SAMEORIGIN
    // and we have no in-app frame usage.
    { key: 'X-Frame-Options', value: 'DENY' },
    // Defense-in-depth equivalent of X-Frame-Options for modern browsers.
    // frame-ancestors/form-action/base-uri have no fallback to default-src, so they
    // must be listed explicitly (SIINFOSEC-769, ZAP-10055). We intentionally do not
    // set script-src/default-src here: Clerk and Sentry inject scripts/connect to
    // their own origins at runtime, and a restrictive policy would break auth and
    // error reporting without a nonce-based setup.
    {
        key: 'Content-Security-Policy',
        value: ["frame-ancestors 'none'", "form-action 'self'", "base-uri 'self'"].join('; '),
    },
    // Prevent MIME-sniffing-based content-type confusion.
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Limit referrer leakage to cross-origin destinations.
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
]

const nextConfig: NextConfig = {
    cacheComponents: false,
    // Don't advertise the framework in responses (SIINFOSEC-771, ZAP-40025).
    poweredByHeader: false,
    productionBrowserSourceMaps: true,
    assetPrefix: isDev ? undefined : '/assets/',
    output: 'standalone',
    typedRoutes: true,
    transpilePackages: ['si-encryption'],
    env: {
        // sets the DSN for Sentry in the client bundle at build time
        NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || '',
    },
    async headers() {
        return [{ source: '/:path*', headers: securityHeaders }]
    },
    // Next 16 dev/build uses Turbopack by default, so the Clerk fake must be aliased
    // via turbopack.resolveAlias (the webpack() hook below is a fallback for any
    // webpack-based build). Both are gated on E2E_FAKE_CLERK so production is untouched.
    ...(fakeClerk
        ? {
              turbopack: {
                  resolveAlias: {
                      '@clerk/nextjs/server': './src/lib/clerk-fake/server.ts',
                      '@clerk/nextjs': './src/lib/clerk-fake/client.tsx',
                  },
              },
          }
        : {}),
    webpack(config) {
        if (fakeClerk) {
            config.resolve.alias = {
                ...config.resolve.alias,
                '@clerk/nextjs/server': path.resolve(__dirname, 'src/lib/clerk-fake/server.ts'),
                '@clerk/nextjs': path.resolve(__dirname, 'src/lib/clerk-fake/client.tsx'),
            }
        }
        return config
    },
    experimental: {
        ...(turbopackFsCache ? { turbopackFileSystemCacheForBuild: true } : {}),
        // https://github.com/phosphor-icons/react?tab=readme-ov-file#nextjs-specific-optimizations
        optimizePackageImports: ['@phosphor-icons/react'],
        serverActions: {
            bodySizeLimit: '6mb',
        },
        // Emit Subresource Integrity (integrity=) hashes on Next's own script tags
        // (SIINFOSEC-772, ZAP-90003).
        sri: {
            algorithm: 'sha256',
        },
    },
}

const configWithSentry = withSentryConfig(nextConfig, {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options
    org: 'openstax',
    project: 'management-app',

    silent: true,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Automatically annotate React components to show their full name in breadcrumbs and session replay
    reactComponentAnnotation: {
        enabled: true,
    },
    sourcemaps: {
        deleteSourcemapsAfterUpload: false,
    },
    // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of
    // client-side errors will fail.
    // tunnelRoute: "/monitoring",

    // Hides source maps from generated client bundles

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,
})

export default configWithSentry
