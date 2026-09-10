import { describe, expect, it } from 'vitest'
import {
    researcherCodeDecisionBanner,
    researcherCodeSubmittedBanner,
    researcherProposalBanner,
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
