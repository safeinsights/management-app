import { describe, expect, it, mockStudyRow } from '@/tests/unit.helpers'
import { pillOrgNamesFromRow } from './pill-context'

describe('pillOrgNamesFromRow', () => {
    it('names the reviewing enclave and the submitting org exactly as stored', () => {
        const names = pillOrgNamesFromRow(
            mockStudyRow({ reviewingEnclaveName: 'Clinical Lab Network', submittingLabName: 'Genius Lab' }),
        )
        expect(names).toEqual({ dataPartner: 'Clinical Lab Network', researchLab: 'Genius Lab' })
    })

    it('falls back to the org name for the data partner and the slug for the lab', () => {
        const names = pillOrgNamesFromRow(
            mockStudyRow({
                reviewingEnclaveName: undefined,
                orgName: 'Openstax',
                submittingLabName: undefined,
                submittedByOrgSlug: 'genius-lab',
            }),
        )
        expect(names).toEqual({ dataPartner: 'Openstax', researchLab: 'genius-lab' })
    })

    it('falls back to the role nouns when a row carries no names at all', () => {
        const names = pillOrgNamesFromRow(
            mockStudyRow({
                reviewingEnclaveName: undefined,
                orgName: undefined,
                submittingLabName: undefined,
                submittedByOrgSlug: undefined,
            }),
        )
        expect(names).toEqual({ dataPartner: 'the Data Partner', researchLab: 'the Research Lab' })
    })
})
