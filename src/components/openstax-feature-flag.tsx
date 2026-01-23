'use client'

import { FC, ReactNode } from 'react'
import { isOpenStaxOrg } from './openstax-only'
import { useSpyMode } from './spy-mode-context'

interface OpenStaxFeatureFlagProps {
    orgSlug: string
    defaultContent: ReactNode
    optInContent: ReactNode
}

export const OpenStaxFeatureFlag: FC<OpenStaxFeatureFlagProps> = ({ orgSlug, defaultContent, optInContent }) => {
    const { isSpyMode } = useSpyMode()
    const showOptIn = isOpenStaxOrg(orgSlug) && isSpyMode

    return showOptIn ? optInContent : defaultContent
}
