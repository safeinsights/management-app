import { isErroredFeedbackOnlyOutcome } from '@/lib/study-screen'
import { OutputsFeedbackLayout } from './outputs-feedback-layout'
import type { ScreenComponentProps } from './types'

// Errored run whose outputs the reviewer withheld with "Share feedback only"
// (JOB-ERRORED + FILES-REJECTED). No outputs table or security key — nothing was released to decrypt.
export async function OutputsErroredFeedbackScreen(
    props: Pick<ScreenComponentProps, 'study' | 'raw' | 'orgSlug' | 'returnTo'>,
) {
    return OutputsFeedbackLayout({
        ...props,
        matches: isErroredFeedbackOnlyOutcome,
        banner: {
            title: 'Resolve the code error to proceed',
            message: (dataPartner) =>
                `${dataPartner} has shared feedback on why the code run failed. The outputs are not available for this study. When you are ready, edit your code and resubmit.`,
        },
    })
}
