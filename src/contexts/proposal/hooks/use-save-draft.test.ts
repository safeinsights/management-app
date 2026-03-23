import { describe, it, expect } from 'vitest'
import { buildStudyInfo } from './use-save-draft'
import { DEFAULT_DRAFT_TITLE, type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
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

    it('transforms all fields correctly', () => {
        const result = buildStudyInfo(validFormValues)

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

    it('converts empty strings to undefined (except title which defaults to Untitled Draft)', () => {
        const formValues: ProposalFormValues = {
            title: '',
            datasets: [],
            researchQuestions: '',
            projectSummary: '',
            impact: '',
            additionalNotes: '',
            piName: '',
            piUserId: '',
        }

        const result = buildStudyInfo(formValues)

        expect(result.title).toBe(DEFAULT_DRAFT_TITLE)
        expect(result.piName).toBeUndefined()
        expect(result.piUserId).toBeUndefined()
        expect(result.researchQuestions).toBeUndefined()
        expect(result.projectSummary).toBeUndefined()
        expect(result.impact).toBeUndefined()
        expect(result.additionalNotes).toBeUndefined()
    })

    it('handles partial form values', () => {
        const formValues: ProposalFormValues = {
            title: 'Only Title',
            datasets: ['ds-1'],
            researchQuestions: '',
            projectSummary: '',
            impact: '',
            additionalNotes: '',
            piName: '',
            piUserId: '',
        }

        const result = buildStudyInfo(formValues)

        expect(result.title).toBe('Only Title')
        expect(result.datasets).toEqual(['ds-1'])
        expect(result.researchQuestions).toBeUndefined()
        expect(result.piName).toBeUndefined()
    })
})
