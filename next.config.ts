import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

const nextConfig: NextConfig = async (phase: string) => {
    const isDev = Boolean(process.env.CI || phase === PHASE_DEVELOPMENT_SERVER)

    const nextConfig: NextConfig = {
        productionBrowserSourceMaps: true,
        assetPrefix: isDev ? undefined : '/assets/',
        output: 'standalone',
        typedRoutes: true,
        transpilePackages: ['si-encryption'],
        env: {
            // sets the DSN for Sentry in the client bundle at build time
            NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || '',
        },
        experimental: {
            // https://github.com/phosphor-icons/react?tab=readme-ov-file#nextjs-specific-optimizations
            optimizePackageImports: ['@phosphor-icons/react'],
            serverActions: {
                bodySizeLimit: '6mb',
            },
        },
    }
    return nextConfig
}

const configWithSentry = withSentryConfig(nextConfig, {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options
    org: 'openstax',
    project: 'management-app',

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

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
