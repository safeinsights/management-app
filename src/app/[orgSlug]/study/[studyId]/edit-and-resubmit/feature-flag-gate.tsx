'use client'

import { type ReactNode } from 'react'
import { ProposalReviewFeatureFlag } from '@/components/openstax-feature-flag'
import { AlertNotFound } from '@/components/errors'

// Hides the entire edit-and-resubmit page unless the OpenStax/spy-mode flag
// is on. We reuse ProposalReviewFeatureFlag (vs. introducing a 521-specific
// alias) since all proposal-flow flags will be removed at the same time.
export function FeatureFlagGate({ children }: { children: ReactNode }) {
    return (
        <ProposalReviewFeatureFlag
            optInContent={children}
            defaultContent={
                <AlertNotFound
                    title="Page not available"
                    message="The edit & resubmit flow is not yet enabled for your organization."
                />
            }
        />
    )
}
