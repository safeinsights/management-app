'use client'

import * as Sentry from '@sentry/nextjs'
import NextError from 'next/error'
import { useEffect } from 'react'

// KNOWN GAP, blocks the flip to an enforcing CSP (OTTER-721).
//
// Next prerenders this entry at build time and bakes in ~6 inline hydration scripts that cannot
// carry a per-request nonce. Unlike not-found, it renders its own <html> and so bypasses the root
// layout, meaning the `await connection()` there does not reach it; a `dynamic` export is ignored
// for this internal entry. Verified against a production build, not assumed.
//
// Harmless while the policy is report-only. Before enforcing, confirm whether those scripts are
// actually blocked here — if they are, the useEffect below never runs and Sentry silently stops
// receiving errors from the page whose only job is reporting them.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
    useEffect(() => {
        Sentry.captureException(error)
    }, [error])

    return (
        <html>
            <body>
                {/* `NextError` is the default Next.js error page component. Its type
        definition requires a `statusCode` prop. However, since the App Router
        does not expose status codes for errors, we simply pass 0 to render a
        generic error message. */}
                <NextError statusCode={0} />
            </body>
        </html>
    )
}
