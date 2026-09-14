'use client'

import { createProviderShare } from './create-provider-share'

export const {
    Share: CodeReviewFeedbackProviderShare,
    usePublish: usePublishCodeReviewFeedbackProvider,
    useProvider: useCodeReviewFeedbackProvider,
} = createProviderShare(
    'CodeReviewFeedbackProviderShare',
    'wrap the code-review page tree in <CodeReviewFeedbackProviderShare> before using the ' + 'editor/listener hooks.',
)
