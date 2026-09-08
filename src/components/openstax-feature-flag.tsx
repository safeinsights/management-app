'use client'

import { FC, ReactNode } from 'react'
import { Alert } from '@mantine/core'
import { OPENSTAX_ORG_SLUGS } from '@/lib/constants'
import { useSession } from '@/hooks/session'
import { useSpyMode } from './spy-mode-context'

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

// Rename these on export to match the feature being flagged, so the name can be searched for
// when the flag is removed.
export {
    useOpenStaxFeatureFlag as useUnusedOpenStaxFeatureFlag,
    OpenStaxFeatureFlag as UnusedOpenStaxFeatureFlag,
    FeatureFlagRequiredAlert as UnusedFeatureFlagRequiredAlert,
}
