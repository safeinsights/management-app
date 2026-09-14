'use client'

import { createProviderShare } from './create-provider-share'

export const {
    Share: ReviewFeedbackProviderShare,
    usePublish: usePublishReviewFeedbackProvider,
    useProvider: useReviewFeedbackProvider,
} = createProviderShare(
    'ReviewFeedbackProviderShare',
    'wrap the review page tree in <ReviewFeedbackProviderShare> before using the editor/listener ' +
        "hooks. Without it the listener never receives the editor provider and kick-out won't fire.",
)
