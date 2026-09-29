'use client'

import { createProviderShare } from './create-provider-share'

export const {
    Share: OutputsReviewFeedbackProviderShare,
    usePublish: usePublishOutputsReviewFeedbackProvider,
    useProvider: useOutputsReviewFeedbackProvider,
} = createProviderShare(
    'OutputsReviewFeedbackProviderShare',
    'wrap the outputs review page tree in <OutputsReviewFeedbackProviderShare> before using the ' +
        'editor/listener hooks.',
)
