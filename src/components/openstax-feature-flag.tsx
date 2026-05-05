'use client'

import { FC, ReactNode } from 'react'
import { Alert } from '@mantine/core'
import { OPENSTAX_ORG_SLUGS } from '@/lib/constants'
import { useSession } from '@/hooks/session'
import { useSpyMode } from './spy-mode-context'

// Returns a boolean indicating whether the user is in spy mode and belongs to an OpenStax organization.
// Use for inline conditional rendering of content.
const useOpenStaxFeatureFlag = () => {
    const { isSpyMode } = useSpyMode()
    const { isLoaded, session } = useSession()

    if (!isLoaded) return false

    const userOrgSlugs = Object.keys(session.orgs)
    const belongsToOpenStax = userOrgSlugs.some((slug) =>
        OPENSTAX_ORG_SLUGS.includes(slug as (typeof OPENSTAX_ORG_SLUGS)[number]),
    )

    return belongsToOpenStax && isSpyMode
}

interface OpenStaxFeatureFlagProps {
    defaultContent: ReactNode
    optInContent: ReactNode
}

// Swaps out the default content with the opt-in content based on the feature flag.
// Use for swapping out entire components/large sections of code.
const OpenStaxFeatureFlag: FC<OpenStaxFeatureFlagProps> = ({ defaultContent, optInContent }) => {
    const isOpenStaxOptIn = useOpenStaxFeatureFlag()
    return isOpenStaxOptIn ? optInContent : defaultContent
}

const FeatureFlagRequiredAlert: FC<{ isNewFlow: boolean; message?: string }> = ({ isNewFlow, message }) => {
    const { isSpyMode } = useSpyMode()

    if (!isNewFlow || isSpyMode) return null

    return (
        <Alert variant="filled" color="red" title="Action Required">
            {message ?? 'This page is not available in the current view. Enable spy mode to continue.'}
        </Alert>
    )
}

// Note: DO NOT EXPORT the above items, instead reaname them like the below example
// with a name that matches the feature you are developing.
// Doing so lets us search for that name when removing the flag
export {
    useOpenStaxFeatureFlag as useUnusedOpenStaxFeatureFlag,
    OpenStaxFeatureFlag as UnusedOpenStaxFeatureFlag,
    FeatureFlagRequiredAlert as UnusedFeatureFlagRequiredAlert,
    // Card 64: DO Proposal Review redesign
    useOpenStaxFeatureFlag as useProposalReviewFeatureFlag,
    OpenStaxFeatureFlag as ProposalReviewFeatureFlag,
    // OTTER-495 & 519: Post-submission page
    useOpenStaxFeatureFlag as usePostSubmissionFeatureFlag,
    OpenStaxFeatureFlag as PostSubmissionFeatureFlag,
    // OTTER-497: Multi-user proposal collaboration
    useOpenStaxFeatureFlag as useProposalCollaborationFeatureFlag,
    OpenStaxFeatureFlag as ProposalCollaborationFeatureFlag,
}
