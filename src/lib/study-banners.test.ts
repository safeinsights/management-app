import { describe, expect, it } from 'vitest'
import {
    researcherCodeDecisionBanner,
    researcherCodeSubmittedBanner,
    researcherOutputsAwaitingReviewBanner,
    researcherOutputsFeedbackBanner,
    researcherOutputsPendingBanner,
    researcherProposalBanner,
    researcherSharedOutputsBanner,
    reviewerCodeDecisionBanner,
    reviewerCodeNeedsReviewBanner,
    reviewerOutputsDecisionBanner,
    reviewerProposalDecisionBanner,
    reviewerProposalNeedsReviewBanner,
} from './study-banners'

const DATA_PARTNER = 'Test Data Partner'

describe('researcherProposalBanner', () => {
    it.each([
        ['CHANGE-REQUESTED', 'action', 'Revision requested'],
        ['APPROVED', 'success', 'Proposal approved'],
        ['REJECTED', 'decline', 'Proposal declined'],
    ] as const)('maps %s to the %s banner', (status, variant, title) => {
        const copy = researcherProposalBanner(status, { dataPartner: DATA_PARTNER })
        expect(copy).toMatchObject({ variant, title })
        expect(copy?.body).toContain(DATA_PARTNER)
    })

    it('names the data partner in the first-submission title', () => {
        expect(researcherProposalBanner('PENDING-REVIEW', { dataPartner: DATA_PARTNER })).toMatchObject({
            variant: 'informative',
            title: `Proposal submitted to ${DATA_PARTNER}`,
        })
    })

    it('versions the title from the second submission onwards', () => {
        expect(researcherProposalBanner('PENDING-REVIEW', { dataPartner: DATA_PARTNER, version: 2 })?.title).toBe(
            `Proposal v2.0 resubmitted to ${DATA_PARTNER}`,
        )
    })

    it('has no banner for a status the ticket does not cover', () => {
        expect(researcherProposalBanner('ARCHIVED', { dataPartner: DATA_PARTNER })).toBeNull()
        expect(researcherProposalBanner('DRAFT', { dataPartner: DATA_PARTNER })).toBeNull()
    })
})

describe('researcherCodeSubmittedBanner', () => {
    it('names the data partner in the title and body on a first submission', () => {
        const copy = researcherCodeSubmittedBanner({ dataPartner: DATA_PARTNER })
        expect(copy).toMatchObject({ variant: 'informative', title: `Code submitted to ${DATA_PARTNER}` })
        expect(copy.body).toContain(`shared with ${DATA_PARTNER}`)
        expect(copy.body).toContain('An email notification will be sent')
    })

    it('versions the title from the second submission onwards', () => {
        expect(researcherCodeSubmittedBanner({ dataPartner: DATA_PARTNER, version: 3 }).title).toBe(
            `Code v3.0 resubmitted to ${DATA_PARTNER}`,
        )
    })
})

describe('researcherCodeDecisionBanner', () => {
    it.each([
        ['CODE-APPROVED', 'success', 'Code approved'],
        ['CODE-CHANGES-REQUESTED', 'action', 'Revision requested on your code'],
        ['CODE-REJECTED', 'decline', 'Code declined'],
    ] as const)('maps %s to the %s banner', (status, variant, title) => {
        const copy = researcherCodeDecisionBanner(status, { dataPartner: DATA_PARTNER })
        expect(copy).toMatchObject({ variant, title })
        expect(copy.body).toContain(DATA_PARTNER)
    })

    it('keeps the terminal details on a declined decision', () => {
        const { body } = researcherCodeDecisionBanner('CODE-REJECTED', { dataPartner: DATA_PARTNER })
        expect(body).toContain('No further code submissions will be accepted for this study')
        expect(body).toContain('contact SafeInsights')
    })
})

describe('researcherSharedOutputsBanner', () => {
    it('gates a clean share behind the key, then concludes it', () => {
        const { locked, unlocked } = researcherSharedOutputsBanner('outputs-shared', { dataPartner: DATA_PARTNER })

        expect(locked).toEqual({
            variant: 'action',
            title: 'Decrypt to view your outputs',
            body: `${DATA_PARTNER} has reviewed and shared the outputs. Use your security key to decrypt and review them.`,
        })
        expect(unlocked).toEqual({
            variant: 'success',
            title: 'Outputs and feedback available',
            body: "Review the outputs and feedback below. If they don't meet your expectations, you can update your code and resubmit.",
        })
    })

    it('keeps an errored share on the action variant after decryption', () => {
        const { locked, unlocked } = researcherSharedOutputsBanner('outputs-errored-shared', {
            dataPartner: DATA_PARTNER,
        })

        expect(locked).toEqual({
            variant: 'action',
            title: 'Decrypt outputs to view code error',
            body: `${DATA_PARTNER} has shared the outputs and feedback. Enter your security key below to decrypt and diagnose the issue.`,
        })
        expect(unlocked).toEqual({
            variant: 'action',
            title: 'Resolve the code error to proceed',
            body: 'Review the outputs and reviewer feedback below to understand why the code run failed, then update your code and resubmit.',
        })
    })
})

describe('researcherOutputsAwaitingReviewBanner', () => {
    it('names the data partner in both the title and the body, and stays informative', () => {
        expect(researcherOutputsAwaitingReviewBanner({ dataPartner: DATA_PARTNER })).toEqual({
            variant: 'informative',
            title: `Code run complete, outputs under review by ${DATA_PARTNER}`,
            body: `${DATA_PARTNER} reviews the outputs before releasing them to you. A notification will be sent when outputs or feedback are shared. Reviews typically take 7 to 10 days.`,
        })
    })

    it('carries no date, which statusAlertTitle appends at the call site', () => {
        expect(researcherOutputsAwaitingReviewBanner({ dataPartner: DATA_PARTNER }).title).not.toContain('•')
    })
})

describe('researcherOutputsPendingBanner', () => {
    it('keeps the run silent while the enclave still has it', () => {
        expect(researcherOutputsPendingBanner({ runErrored: false })).toEqual({
            variant: 'informative',
            title: 'Outputs not ready, code processing started',
            body: 'Your code is running in the secure enclave. This can take a while, depending on how complex it is. An email notification will be sent when your outputs are ready or if anything goes wrong.',
        })
    })

    it('hands a failed run to the data partner without naming the error', () => {
        const copy = researcherOutputsPendingBanner({ runErrored: true })

        expect(copy).toEqual({
            variant: 'informative',
            title: 'Outputs not ready, awaiting review',
            body: 'Code processing has finished and is with the data partner for review. An email notification will be sent when your outputs are ready or if anything needs your attention.',
        })
        expect(copy.body).not.toMatch(/error|fail/i)
    })
})

describe('researcherOutputsFeedbackBanner', () => {
    it('names the failed run when the outputs were withheld after an error', () => {
        expect(researcherOutputsFeedbackBanner({ runErrored: true }, { dataPartner: DATA_PARTNER })).toEqual({
            variant: 'action',
            title: 'Resolve the code error to proceed',
            body: `${DATA_PARTNER} has shared feedback on why the code run failed. The outputs are not available for this study. When you are ready, edit your code and resubmit.`,
        })
    })

    it('reads as plain feedback when the run itself completed', () => {
        expect(researcherOutputsFeedbackBanner({ runErrored: false }, { dataPartner: DATA_PARTNER })).toEqual({
            variant: 'action',
            title: 'Feedback on outputs available',
            body: `${DATA_PARTNER} has shared feedback on the latest code run. The outputs are not available for this study. When you are ready, edit your code and resubmit.`,
        })
    })

    it('parts from the errored share on the body, which names the withheld outputs', () => {
        const withheld = researcherOutputsFeedbackBanner({ runErrored: true }, { dataPartner: DATA_PARTNER })
        const { unlocked: shared } = researcherSharedOutputsBanner('outputs-errored-shared', {
            dataPartner: DATA_PARTNER,
        })

        expect(withheld.body).not.toBe(shared.body)
        expect(withheld.body).toContain('The outputs are not available for this study')
    })
})

const RESEARCH_LAB = 'Test Research Lab'
const REVIEWER = 'Test Reviewer'

describe('reviewerProposalNeedsReviewBanner', () => {
    it('names the lab in the first-review title and body', () => {
        const copy = reviewerProposalNeedsReviewBanner({ researchLab: RESEARCH_LAB })
        expect(copy).toMatchObject({ variant: 'action', title: `New proposal submitted by ${RESEARCH_LAB}` })
        expect(copy.body).toContain('requesting permission to run their code on your data')
    })

    it('switches to the revised title from the second review round onwards', () => {
        expect(reviewerProposalNeedsReviewBanner({ researchLab: RESEARCH_LAB, version: 2 }).title).toBe(
            `Revised proposal submitted by ${RESEARCH_LAB}`,
        )
    })
})

describe('reviewerProposalDecisionBanner', () => {
    it.each([
        ['APPROVE', 'informative', 'Proposal approved'],
        ['NEEDS-CLARIFICATION', 'informative', 'Revision requested'],
        ['REJECT', 'decline', 'Proposal declined'],
    ] as const)('maps %s to the %s banner, attributed to the reviewer', (decision, variant, action) => {
        expect(
            reviewerProposalDecisionBanner(decision, { researchLab: RESEARCH_LAB, reviewerName: REVIEWER }),
        ).toMatchObject({ variant, title: `${action} by ${REVIEWER}` })
    })

    it.each([null, undefined])('drops the attribution when no reviewer is known (%s)', (reviewerName) => {
        expect(reviewerProposalDecisionBanner('APPROVE', { researchLab: RESEARCH_LAB, reviewerName }).title).toBe(
            'Proposal approved',
        )
    })

    it('names the lab in the bodies that reference it', () => {
        const params = { researchLab: RESEARCH_LAB, reviewerName: REVIEWER }
        expect(reviewerProposalDecisionBanner('APPROVE', params).body).toContain(
            `${RESEARCH_LAB} moves to the next step`,
        )
        expect(reviewerProposalDecisionBanner('NEEDS-CLARIFICATION', params).body).toContain(
            `${RESEARCH_LAB} resubmits the proposal`,
        )
        // The declined body is terminal and deliberately names no one.
        expect(reviewerProposalDecisionBanner('REJECT', params).body).toBe(
            'This proposal has been declined. No further action is required.',
        )
    })
})

describe('reviewerCodeNeedsReviewBanner', () => {
    it('names the lab in the first-review title', () => {
        const copy = reviewerCodeNeedsReviewBanner({ researchLab: RESEARCH_LAB })
        expect(copy).toMatchObject({ variant: 'action', title: `New code submitted by ${RESEARCH_LAB}` })
        expect(copy.body).toContain('Review the code files, security log, and AI summary')
    })

    it('switches to the revised title from the second round onwards', () => {
        expect(reviewerCodeNeedsReviewBanner({ researchLab: RESEARCH_LAB, version: 2 }).title).toBe(
            `Revised code submitted by ${RESEARCH_LAB}`,
        )
    })
})

describe('reviewerCodeDecisionBanner', () => {
    it.each([
        ['APPROVE', 'informative', 'Code approved'],
        ['NEEDS-CLARIFICATION', 'informative', 'Revision requested'],
        ['REJECT', 'decline', 'Code declined'],
    ] as const)('maps %s to the %s banner, attributed to the reviewer', (decision, variant, action) => {
        expect(
            reviewerCodeDecisionBanner(decision, { researchLab: RESEARCH_LAB, reviewerName: REVIEWER }),
        ).toMatchObject({ variant, title: `${action} by ${REVIEWER}` })
    })

    it('names the lab only in the revision-requested body', () => {
        const params = { researchLab: RESEARCH_LAB, reviewerName: REVIEWER }
        expect(reviewerCodeDecisionBanner('NEEDS-CLARIFICATION', params).body).toContain(
            `${RESEARCH_LAB} resubmits their code`,
        )
        expect(reviewerCodeDecisionBanner('APPROVE', params).body).not.toContain(RESEARCH_LAB)
        expect(reviewerCodeDecisionBanner('REJECT', params).body).not.toContain(RESEARCH_LAB)
    })
})

describe('reviewerOutputsDecisionBanner', () => {
    it.each([
        ['Code errored. Outputs and feedback shared', true, true],
        ['Code errored. Feedback shared', true, false],
        ['Outputs and feedback shared', false, true],
        ['Feedback shared', false, false],
    ] as const)(
        'attributes "%s" to the reviewer who submitted the decision',
        (action, resultsErrored, resultsApproved) => {
            expect(
                reviewerOutputsDecisionBanner(
                    { resultsErrored, resultsApproved },
                    { researchLab: RESEARCH_LAB, reviewerName: REVIEWER },
                ),
            ).toMatchObject({
                variant: 'informative',
                title: `${action} by ${REVIEWER}`,
            })
        },
    )

    it.each([null, undefined])('drops the attribution when no reviewer is known (%s)', (reviewerName) => {
        expect(
            reviewerOutputsDecisionBanner(
                { resultsErrored: false, resultsApproved: true },
                { researchLab: RESEARCH_LAB, reviewerName },
            ).title,
        ).toBe('Outputs and feedback shared')
    })

    it('names the lab in every body', () => {
        const params = { researchLab: RESEARCH_LAB, reviewerName: REVIEWER }
        expect(reviewerOutputsDecisionBanner({ resultsErrored: true, resultsApproved: true }, params).body).toContain(
            RESEARCH_LAB,
        )
        expect(reviewerOutputsDecisionBanner({ resultsErrored: true, resultsApproved: false }, params).body).toContain(
            RESEARCH_LAB,
        )
        expect(reviewerOutputsDecisionBanner({ resultsErrored: false, resultsApproved: true }, params).body).toContain(
            RESEARCH_LAB,
        )
        expect(reviewerOutputsDecisionBanner({ resultsErrored: false, resultsApproved: false }, params).body).toContain(
            RESEARCH_LAB,
        )
    })
})
