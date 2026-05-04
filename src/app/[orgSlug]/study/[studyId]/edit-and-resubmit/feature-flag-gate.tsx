'use client'

import { type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Routes } from '@/lib/routes'
import { useEditAndResubmitProposalFeatureFlag } from '@/components/openstax-feature-flag'
import { AlertNotFound } from '@/components/errors'

interface FeatureFlagGateProps {
    children: ReactNode
    orgSlug: string
    studyId: string
}

// Hides the entire edit-and-resubmit page unless the OpenStax/spy-mode flag is on.
// When off, redirects to the existing /view page so the researcher still has a path forward.
export function FeatureFlagGate({ children, orgSlug, studyId }: FeatureFlagGateProps) {
    const isOptIn = useEditAndResubmitProposalFeatureFlag()
    const router = useRouter()

    if (isOptIn) return <>{children}</>

    // Schedule a client-side redirect; render a fallback in the meantime.
    if (typeof window !== 'undefined') {
        router.replace(Routes.studyView({ orgSlug, studyId }))
    }

    return (
        <AlertNotFound
            title="Page not available"
            message="The edit & resubmit flow is not yet enabled for your organization."
        />
    )
}
