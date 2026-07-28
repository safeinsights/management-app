import { describe, expect, it } from 'vitest'
import { missingProposalFields } from './missing-fields'
import { initialProposalValues, type ProposalFormValues } from './schema'

const lexicalText = (text: string) =>
    JSON.stringify({
        root: {
            children: [
                {
                    children: [{ detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }],
                    direction: 'ltr',
                    format: '',
                    indent: 0,
                    type: 'paragraph',
                    version: 1,
                },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
        },
    })

const complete: ProposalFormValues = {
    ...initialProposalValues,
    title: 'A real title',
    datasets: ['dataset-1'],
    researchQuestions: lexicalText('Why?'),
    projectSummary: lexicalText('Because.'),
    impact: lexicalText('It helps.'),
    piName: 'Jane Smith',
    piUserId: 'f7c3bc1d-808e-4a3d-a4b8-9f0a3e2b1c4d',
}

describe('missingProposalFields', () => {
    it('lists every required field for an empty proposal, in page order', () => {
        expect(missingProposalFields(initialProposalValues)).toEqual([
            'Study title',
            'Dataset(s) of interest',
            'Research question(s)',
            'Project summary',
            'Impact',
            'Principal Investigator',
        ])
    })

    it('returns nothing when the proposal is complete', () => {
        expect(missingProposalFields(complete)).toEqual([])
    })

    it('treats a whitespace-only title as missing', () => {
        expect(missingProposalFields({ ...complete, title: '   ' })).toEqual(['Study title'])
    })

    // A legacy draft can carry a PI name with no linked user id. Submission requires the id, but
    // no field displays it, so leaving it out of this list disabled submit while naming nothing.
    it('reports the Principal Investigator when the name has no linked user', () => {
        expect(missingProposalFields({ ...complete, piUserId: '' })).toEqual(['Principal Investigator'])
    })

    // A non-empty id that is not a UUID still fails the submit gate, so a non-emptiness check here
    // would drop the field out of the hint while submit stayed disabled with nothing named.
    it('reports the Principal Investigator when the linked id is not a valid uuid', () => {
        expect(missingProposalFields({ ...complete, piUserId: 'not-a-uuid' })).toEqual(['Principal Investigator'])
    })

    // additionalNotes is optional, so it must never appear in the list.
    it('never reports additional notes', () => {
        expect(missingProposalFields({ ...complete, additionalNotes: '' })).toEqual([])
    })
})
