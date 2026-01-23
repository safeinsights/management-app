'use client'

import { FC, ReactNode } from 'react'
import { OPENSTAX_ORG_SLUGS } from '@/lib/constants'
import { useSession } from '@/hooks/session'
import { useSpyMode } from './spy-mode-context'

interface OpenStaxFeatureFlagProps {
    defaultContent: ReactNode
    optInContent: ReactNode
}

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
