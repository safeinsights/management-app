'use client'

import { notFound } from 'next/navigation'

// Defers notFound() to client-side render so it only fires when this subtree
// actually renders on the client. Calling notFound() directly from the
// EditAndResubmitOptIn server component would throw during SSR even for
// non-opted-in viewers (whose feature flag swaps in the default content),
// because client components serialize their ReactNode props server-side.
export function NotFoundOnMount(): null {
    if (typeof window !== 'undefined') notFound()
    return null
}
