import type { ReactNode } from 'react'
import { OrgName } from '@/components/study/org-name'

// Shared by the Step 2 proposal page and the Edit proposal page, which the card requires to read
// identically (OTTER-691, OTTER-762).

export const proposalIntroText = (orgName: string) =>
    `Submit your proposal to ${orgName} for review. They will assess its feasibility, scientific value, and potential impact on instructional practice. After review, they may approve it, request revisions, or decline it.`

export const datasetsDescription = (orgName: string) =>
    `Select the datasets available through ${orgName} for this study.`

const confirmSubmitBody = (orgName: string) => (
    <>
        Your proposal will be sent to <OrgName>{orgName}</OrgName> for review. You will not be able to make changes once
        submitted.
    </>
)

export interface ConfirmModalCopy {
    title: string
    body: ReactNode
    confirmLabel: string
    /** Omit to keep the confirm label beside the spinner. */
    confirmLoadingLabel?: string
}

// The two pages' modals share the body and differ only in the verb.
export const submitModalCopy = (orgName: string): ConfirmModalCopy => ({
    title: 'Submit your proposal?',
    body: confirmSubmitBody(orgName),
    confirmLabel: 'Submit proposal',
    confirmLoadingLabel: 'Submitting',
})

export const resubmitModalCopy = (orgName: string): ConfirmModalCopy => ({
    title: 'Resubmit your proposal?',
    body: confirmSubmitBody(orgName),
    confirmLabel: 'Resubmit proposal',
    confirmLoadingLabel: 'Resubmitting',
})

// Submit code and Edit code share the body and differ only in the verb.
const confirmCodeBody = (orgName: string) => (
    <>
        Your code will be sent to <OrgName>{orgName}</OrgName> for review. If approved, it will run in the secure
        enclave. You will not be able to make changes after you submit.
    </>
)

export const submitCodeModalCopy = (orgName: string): ConfirmModalCopy => ({
    title: 'Submit code for review?',
    body: confirmCodeBody(orgName),
    confirmLabel: 'Submit code',
    confirmLoadingLabel: 'Submitting',
})

export const resubmitCodeModalCopy = (orgName: string): ConfirmModalCopy => ({
    title: 'Resubmit your code for review?',
    body: confirmCodeBody(orgName),
    confirmLabel: 'Resubmit code',
    confirmLoadingLabel: 'Resubmitting',
})
