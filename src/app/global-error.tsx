'use client'

import * as Sentry from '@sentry/nextjs'
import NextError from 'next/error'
import { useEffect } from 'react'

// KNOWN GAP blocking an enforcing CSP (OTTER-721): this entry renders its own <html>, so the root
// layout's `connection()` never reaches it and its inline hydration scripts get no nonce.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
    useEffect(() => {
        Sentry.captureException(error)
    }, [error])

    return (
        <html>
            <body>
                {/* The App Router exposes no status code, so 0 renders the generic message. */}
                <NextError statusCode={0} />
            </body>
        </html>
    )
}
