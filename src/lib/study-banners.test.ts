import { describe, expect, it } from 'vitest'
import { researcherCodeDecisionBanner, researcherCodeSubmittedBanner, researcherProposalBanner } from './study-banners'

// The RL screens name the data partner who reviewed the work; these builders are all researcher-facing.
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
