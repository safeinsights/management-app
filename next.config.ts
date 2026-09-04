import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'
import path from 'node:path'

const isDev = Boolean(process.env.CI || process.env.NODE_ENV === 'development')

// When E2E_FAKE_CLERK is set, swap the real Clerk SDK for the in-app fake under
// src/lib/clerk-fake so e2e tests run with zero Clerk network. Production builds
// (flag unset) are untouched. See src/lib/clerk-fake/README intent in server.ts.
const fakeClerk = Boolean(process.env.E2E_FAKE_CLERK)

// Turbopack's build filesystem cache only pays off where .next/cache survives between builds.
// Next 16.3 turns it on by default, so the flag is always passed: omitting it would mean "on".
//
// On for the CI e2e build (see .github/workflows/checks.yml), where actions/cache restores
// .next/cache between runs. Off for the deploy build, which wipes its build directory and
// re-extracts the release tarball per release, so the cache would be written and never read.
//
// A corrupt cache fails the build loudly, never a false-green test run. A stale build is the
// quieter risk, but content hashing plus a cache key over every source file make it unlikely.
// If a CI build looks stale, bump the tpc token in the workflow cache key to bust the cache.
const turbopackFsCache = Boolean(process.env.TURBOPACK_FS_CACHE)

// Server Action IDs, and the encrypted arguments bound into them, are derived from Next's Server
// Actions encryption key. Left unset, Next mints a fresh key per build, so a browser still holding
// the previous build's JS posts an action ID the new build cannot resolve; Next rejects it with
// "Invalid Server Actions request." before any of our code — and so before Sentry — runs, which is
// why those 500s never reached Sentry. A blue/green slot cutover swaps builds under live tabs,
// which is exactly that case.
//
// Next 16 reads the key ONLY from this environment variable — the old
// experimental.serverActions.encryptionKey config option no longer exists — and it has to be set
// identically for `next build` (the IDs are baked in there) and for the running server. Deployed
// builds get it from Secrets Manager; local dev and CI let Next generate a throwaway one, since
// nothing there outlives a rebuild. A deployed build silently falling back to a generated key is
// the bug being fixed here, so fail loudly rather than ship one.
//
// `next typegen` is exempt. It loads this config in the production-build phase but emits no build,
// and since Next 16.3 the throw is fatal there, so it would fail `pnpm run checks` for every
// developer without the secret over a key typegen never uses.
const isTypegen = process.argv.includes('typegen')
if (!process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY && !isDev && !isTypegen) {
    throw new Error(
        'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY must be set for a production build. ' +
            'It comes from the MgmntAppBuildVars secret; see cicd/management-app in the iac repo.',
    )
}

const securityHeaders = [
    // Clickjacking protection (SIINFOSEC-470, ZAP-10020).
    // We never want this app embedded in a frame; DENY is stricter than SAMEORIGIN
    // and we have no in-app frame usage.
    { key: 'X-Frame-Options', value: 'DENY' },
    // Defense-in-depth equivalent of X-Frame-Options for modern browsers.
    // frame-ancestors/form-action/base-uri have no fallback to default-src, so they
    // must be listed explicitly (SIINFOSEC-769, ZAP-10055). Only request-independent
    // directives belong here. script-src is nonce-based and therefore per-request, so
    // it is emitted from src/proxy.ts — under the report-only header name while that
    // policy's rollout is measured (see src/lib/csp.ts for why the names differ).
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
    // The server chunks load @swc/helpers ESM at runtime, but file tracing resolves the package
    // through its CJS condition and copies cjs/ only, so the standalone server fails to boot with
    // "Cannot find module .../@swc/helpers/esm/...". Trace the ESM files explicitly. Two globs
    // because pnpm stores the real package under .pnpm/ and only symlinks it to dependents.
    outputFileTracingIncludes: {
        '**': [
            './node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**',
            './node_modules/**/@swc/helpers/esm/**',
        ],
    },
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
        turbopackFileSystemCacheForBuild: turbopackFsCache,
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
        // Sentry keeps its own uploaded copy, so stripping .map files from the client
        // bundle preserves symbolication while keeping sourcesContent off the CDN.
        deleteSourcemapsAfterUpload: true,
    },
    // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of
    // client-side errors will fail.
    // tunnelRoute: "/monitoring",

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,
})

export default configWithSentry
