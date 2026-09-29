import { notifications } from '@mantine/notifications'
import { captureException } from '@sentry/nextjs'
import { SUBMIT_BUTTON_ID } from '@/app/[orgSlug]/study/[studyId]/proposal/field-ids'

export const SUBMIT_SUCCESS_TITLE = 'Proposal submitted'
export const SUBMIT_FAILURE_TITLE = 'Proposal could not be submitted'
export const SUBMIT_FAILURE_MESSAGE = 'Your work is saved. Try again.'
// Replaces SUBMIT_FAILURE_MESSAGE when the recovery save also fails: this path must never claim
// the user's work is safe when it is not.
export const SUBMIT_FAILURE_UNSAVED_MESSAGE = 'We could not save your work. Keep this tab open and try again.'

// Shared by Submit (Step 2) and Resubmit (Edit proposal), which differ only in what they flush. A
// failed submission writes nothing and single-user mode has no Yjs autosave behind it, so the
// flushes are awaited before the toast and decide which message is truthful.
export async function reportSubmissionFailure(error: unknown, flushes: Promise<boolean>[]) {
    // Not reportError: that appends a Sentry reference id to the message, and this copy is
    // specified exactly.
    captureException(error)

    const saved = await Promise.all(flushes)
    notifications.show({
        color: 'red',
        title: SUBMIT_FAILURE_TITLE,
        message: saved.every(Boolean) ? SUBMIT_FAILURE_MESSAGE : SUBMIT_FAILURE_UNSAVED_MESSAGE,
    })

    document.getElementById(SUBMIT_BUTTON_ID)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
