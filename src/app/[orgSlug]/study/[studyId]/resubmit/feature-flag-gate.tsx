'use client'

import { type ReactNode } from 'react'
import { EditAndResubmitCodeFeatureFlag } from '@/components/openstax-feature-flag'

interface FeatureFlagGateProps {
    optInContent: ReactNode
    defaultContent: ReactNode
}

export function FeatureFlagGate({ optInContent, defaultContent }: FeatureFlagGateProps) {
    return <EditAndResubmitCodeFeatureFlag optInContent={optInContent} defaultContent={defaultContent} />
}
