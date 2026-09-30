import { describe, it, expect } from 'vitest'
import { buildStudyInfo } from './build-study-info'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { BLANK_UUID } from '@/tests/unit.helpers'

describe('buildStudyInfo', () => {
    const validFormValues: ProposalFormValues = {
        title: 'Test Study Title',
        datasets: ['dataset-1', 'dataset-2'],
        researchQuestions: '{"root":{"type":"text","text":"Research question content"}}',
        projectSummary: '{"root":{"type":"text","text":"Project summary content"}}',
        impact: '{"root":{"type":"text","text":"Impact content"}}',
        additionalNotes: '{"root":{"type":"text","text":"Additional notes"}}',
        piName: 'Dr. Jane Smith',
        piUserId: BLANK_UUID,
    }

    const blankFormValues: ProposalFormValues = {
        title: '',
        datasets: [],
        researchQuestions: '',
        projectSummary: '',
        impact: '',
        additionalNotes: '',
        piName: '',
        piUserId: '',
    }

    it('transforms all fields correctly', () => {
        const result = buildStudyInfo(validFormValues, 'send')

        expect(result).toEqual({
            title: 'Test Study Title',
            piName: 'Dr. Jane Smith',
            piUserId: BLANK_UUID,
            datasets: ['dataset-1', 'dataset-2'],
            researchQuestions: '{"root":{"type":"text","text":"Research question content"}}',
            projectSummary: '{"root":{"type":"text","text":"Project summary content"}}',
            impact: '{"root":{"type":"text","text":"Impact content"}}',
            additionalNotes: '{"root":{"type":"text","text":"Additional notes"}}',
        })
    })

    it('converts empty strings to undefined and a blank title to null under send', () => {
        const result = buildStudyInfo(blankFormValues, 'send')

        expect(result.title).toBeNull()
        expect(result.piName).toBeUndefined()
        expect(result.piUserId).toBeUndefined()
        expect(result.researchQuestions).toBeUndefined()
        expect(result.projectSummary).toBeUndefined()
        expect(result.impact).toBeUndefined()
        expect(result.additionalNotes).toBeUndefined()
    })

    it('handles partial form values', () => {
        const result = buildStudyInfo({ ...blankFormValues, title: 'Only Title', datasets: ['ds-1'] }, 'send')

        expect(result.title).toBe('Only Title')
        expect(result.datasets).toEqual(['ds-1'])
        expect(result.researchQuestions).toBeUndefined()
        expect(result.piName).toBeUndefined()
    })

    // The actions skip undefined keys, so omitting preserves the Step 1 title where a
    // present-but-null key would null the column (OTTER-690).
    describe("titleMode 'omit'", () => {
        it('leaves the title key out even when the form holds one', () => {
            const result = buildStudyInfo(validFormValues, 'omit')

            expect('title' in result).toBe(false)
            expect(result.datasets).toEqual(['dataset-1', 'dataset-2'])
        })

        it('leaves the title key out when the form title is blank', () => {
            expect('title' in buildStudyInfo(blankFormValues, 'omit')).toBe(false)
        })
    })

    describe("titleMode 'omitIfBlank'", () => {
        it('sends a real title', () => {
            expect(buildStudyInfo(validFormValues, 'omitIfBlank').title).toBe('Test Study Title')
        })

        // A NULL title on a non-DRAFT row violates study_title_required_when_not_draft, which is
        // the row this mode's caller writes to.
        it('omits a blank title rather than sending null', () => {
            expect('title' in buildStudyInfo(blankFormValues, 'omitIfBlank')).toBe(false)
            expect('title' in buildStudyInfo({ ...blankFormValues, title: '   ' }, 'omitIfBlank')).toBe(false)
        })
    })
})
