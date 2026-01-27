'use client'

import { FC, ReactNode } from 'react'
import { OPENSTAX_ORG_SLUGS } from '@/lib/constants'
import { useSession } from '@/hooks/session'
import { useSpyMode } from './spy-mode-context'

// Returns a boolean indicating whether the user is in spy mode and belongs to an OpenStax organization.
// Use for inline conditional rendering of content.
export const useOpenStaxFeatureFlag = () => {
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
export const OpenStaxFeatureFlag: FC<OpenStaxFeatureFlagProps> = ({ defaultContent, optInContent }) => {
    const { isSpyMode } = useSpyMode()
    const { isLoaded, session } = useSession()

    if (!isLoaded) {
        return defaultContent
    }

    const userOrgSlugs = Object.keys(session.orgs)
    const belongsToOpenStax = userOrgSlugs.some((slug) =>
        OPENSTAX_ORG_SLUGS.includes(slug as (typeof OPENSTAX_ORG_SLUGS)[number]),
    )

    const showOptIn = belongsToOpenStax && isSpyMode

    return showOptIn ? optInContent : defaultContent
}
