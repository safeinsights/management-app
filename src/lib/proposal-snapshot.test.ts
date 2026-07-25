import { describe, expect, it } from 'vitest'
import { parseProposalSnapshot, serializeProposalSnapshot, type ProposalSnapshotSource } from './proposal-snapshot'

const source: ProposalSnapshotSource = {
    title: 'A study',
    piName: 'Dr. PI',
    piUserId: 'pi-1',
    language: 'R',
    datasets: ['ds-1', 'ds-2'],
    dataSources: ['all'],
    researchQuestions: { root: 'rq' },
    projectSummary: null,
    impact: { root: 'impact' },
    additionalNotes: null,
    irbProtocols: 'https://example.com',
    descriptionDocPath: 'desc.pdf',
    irbDocPath: null,
    agreementDocPath: null,
}

describe('proposal snapshot serializer', () => {
    it('round-trips every reviewer-visible field', () => {
        const snap = serializeProposalSnapshot(source)
        expect(snap).toEqual({
            title: 'A study',
            piName: 'Dr. PI',
            piUserId: 'pi-1',
            language: 'R',
            datasets: ['ds-1', 'ds-2'],
            dataSources: ['all'],
            researchQuestions: { root: 'rq' },
            projectSummary: null,
            impact: { root: 'impact' },
            additionalNotes: null,
            irbProtocols: 'https://example.com',
            descriptionDocPath: 'desc.pdf',
            irbDocPath: null,
            agreementDocPath: null,
        })
        // A stored snapshot parses back to the same object.
        expect(parseProposalSnapshot(snap)).toEqual(snap)
    })

    it('normalizes missing arrays and json bodies', () => {
        const snap = serializeProposalSnapshot({
            ...source,
            dataSources: [],
            datasets: null,
            researchQuestions: undefined,
        })
        expect(snap.dataSources).toEqual([])
        expect(snap.datasets).toBeNull()
        expect(snap.researchQuestions).toBeNull()
    })

    it('rejects a malformed stored snapshot', () => {
        expect(() => parseProposalSnapshot({ title: 'x' })).toThrow()
        expect(() => parseProposalSnapshot({ ...source, language: 'JAVASCRIPT' })).toThrow()
    })
})
