import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const isDev = Boolean(process.env.CI || process.env.NODE_ENV === 'development')

const securityHeaders = [
    // Clickjacking protection (SIINFOSEC-470, ZAP-10020).
    // We never want this app embedded in a frame; DENY is stricter than SAMEORIGIN
    // and we have no in-app frame usage.
    { key: 'X-Frame-Options', value: 'DENY' },
    // Defense-in-depth equivalent of X-Frame-Options for modern browsers.
    { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
    // Prevent MIME-sniffing-based content-type confusion.
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Limit referrer leakage to cross-origin destinations.
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
]

const nextConfig: NextConfig = {
    cacheComponents: false,
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
    experimental: {
        // https://github.com/phosphor-icons/react?tab=readme-ov-file#nextjs-specific-optimizations
        optimizePackageImports: ['@phosphor-icons/react'],
        serverActions: {
            bodySizeLimit: '6mb',
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
