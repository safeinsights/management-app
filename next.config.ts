import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

const nextConfig: NextConfig = async (phase: string) => {
    const isDev = phase === PHASE_DEVELOPMENT_SERVER

    const nextConfig: NextConfig = {
        productionBrowserSourceMaps: true,
        assetPrefix: (process.env.CI || isDev) ? undefined : '/assets/',
        output: 'standalone',
        transpilePackages: ['si-encryption'],
        experimental: {
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
