import type { ActionError } from '@/lib/errors'
import { isActionError } from '@/lib/errors'

export async function loadFeedbackEntries<T>(
    action: (params: { studyId: string }) => Promise<T | ActionError>,
    studyId: string,
): Promise<{ entries: T | []; feedbackLoadError: boolean }> {
    const result = await action({ studyId })
    if (isActionError(result)) {
        return { entries: [], feedbackLoadError: true }
    }
    return { entries: result, feedbackLoadError: false }
}
