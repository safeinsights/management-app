import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'
import path from 'node:path'

const isDev = Boolean(process.env.CI || process.env.NODE_ENV === 'development')

// When E2E_FAKE_CLERK is set, swap the real Clerk SDK for the in-app fake under
// src/lib/clerk-fake so e2e tests run with zero Clerk network. Production builds
// (flag unset) are untouched. See src/lib/clerk-fake/README intent in server.ts.
const fakeClerk = Boolean(process.env.E2E_FAKE_CLERK)

// Turbopack's persistent filesystem cache for `next build` is on by default from Next 16.3, so
// there is no config key here to gate it any more. It writes to .next/cache, which CI persists
// across runs (see .github/workflows/checks.yml) to make incremental rebuilds much faster. The
// deploy build is unaffected either way: iac's cicd/management-app wipes its build directory and
// re-extracts the release tarball for every release, so that cache is always cold there. A corrupt
// cache fails loudly at build time (a red build, never a false-green test run). The rarer, quieter
// risk is a stale build if invalidation ever missed a change; content-hash change detection plus a
// cache key that hashes every source file make this unlikely, but if a CI build is ever suspected
// stale, bust the cache by bumping the tpc token in the workflow cache key.

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
// `next typegen` loads this config with the production-build phase but emits no build, so it is
// exempt: since Next 16.3 the throw is fatal there, which would fail `pnpm run checks` for every
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
    // The compiled server chunks resolve SWC's ESM helpers at runtime, but file tracing follows
    // @swc/helpers through its CJS export condition and copies cjs/ only. Without these globs the
    // standalone server dies on boot with "Cannot find module .../@swc/helpers/esm/...", so trace
    // the ESM helpers explicitly. Both layouts are listed because pnpm keeps the real package
    // under .pnpm/ and only symlinks it where a dependent can see it.
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
