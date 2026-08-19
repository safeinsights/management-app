import { isFeedbackOnlyOutcome } from '@/lib/study-screen'
import { OutputsFeedbackLayout } from './outputs-feedback-layout'
import type { ScreenComponentProps } from './types'

// OTTER-695: clean run whose outputs the reviewer withheld with "Share feedback only"
// (FILES-REJECTED without JOB-ERRORED); the researcher reads the feedback and resubmits.
export async function OutputsFeedbackScreen(
    props: Pick<ScreenComponentProps, 'study' | 'raw' | 'orgSlug' | 'returnTo'>,
) {
    return OutputsFeedbackLayout({
        ...props,
        matches: isFeedbackOnlyOutcome,
        banner: {
            title: 'Feedback on outputs available',
            message: (dataPartner) =>
                `${dataPartner} has shared feedback on the latest code run. The outputs are not available for this study. When you are ready, edit your code and resubmit.`,
        },
    })
}
