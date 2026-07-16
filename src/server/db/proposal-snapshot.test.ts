import { describe, expect, it } from 'vitest'
import { db, insertTestOrg, insertTestStudyOnly } from '@/tests/unit.helpers'
import type { Json } from '@/database/types'
import { serializeProposalSnapshot, type ProposalSnapshotSource } from '@/lib/proposal-snapshot'
import { latestProposalSnapshotForStudy, overlaidWithLatestProposalSnapshot } from './proposal-snapshot'

const baseSource: ProposalSnapshotSource = {
    title: 'v1 title',
    piName: 'Dr. PI',
    piUserId: null,
    language: 'R',
    datasets: null,
    dataSources: [],
    researchQuestions: { root: 'rq-v1' },
    projectSummary: null,
    impact: null,
    additionalNotes: null,
    irbProtocols: null,
    descriptionDocPath: null,
    irbDocPath: null,
    agreementDocPath: null,
}

const insertSnapshot = (studyId: string, userId: string, version: number, source: ProposalSnapshotSource) =>
    db
        .insertInto('studyProposalSubmission')
        .values({
            studyId,
            version,
            submittedByUserId: userId,
            snapshot: serializeProposalSnapshot(source) as unknown as Json,
        })
        .execute()

describe('latestProposalSnapshotForStudy', () => {
    it('returns the highest-version snapshot', async () => {
        const org = await insertTestOrg()
        const { study } = await insertTestStudyOnly({ org })
        await insertSnapshot(study.id, study.researcherId, 1, baseSource)
        await insertSnapshot(study.id, study.researcherId, 2, { ...baseSource, title: 'v2 title' })

        const latest = await latestProposalSnapshotForStudy(study.id)
        expect(latest?.version).toBe(2)
        expect(latest?.snapshot.title).toBe('v2 title')
    })

    it('returns null for a study with no snapshot (fresh draft)', async () => {
        const org = await insertTestOrg()
        const { study } = await insertTestStudyOnly({ org })
        expect(await latestProposalSnapshotForStudy(study.id)).toBeNull()
    })
})

describe('overlaidWithLatestProposalSnapshot', () => {
    it('overlays snapshot proposal fields onto the study, leaving non-proposal fields intact', async () => {
        const org = await insertTestOrg()
        const { study } = await insertTestStudyOnly({ org })
        await insertSnapshot(study.id, study.researcherId, 1, { ...baseSource, title: 'snapshot title' })

        // A mutable study object whose title diverges from the snapshot (as during a revision draft).
        const mutable = { id: study.id, title: 'MUTATED live title', status: 'CHANGE-REQUESTED' } as never

        const overlaid = await overlaidWithLatestProposalSnapshot(study.id, mutable)
        expect(overlaid.title).toBe('snapshot title')
        // Non-proposal fields are preserved from the passed study.
        expect(overlaid.status).toBe('CHANGE-REQUESTED')
        expect(overlaid.id).toBe(study.id)
    })

    it('returns the study unchanged when no snapshot exists', async () => {
        const org = await insertTestOrg()
        const { study } = await insertTestStudyOnly({ org })
        const mutable = { id: study.id, title: 'fresh draft title' } as never
        const overlaid = await overlaidWithLatestProposalSnapshot(study.id, mutable)
        expect(overlaid.title).toBe('fresh draft title')
    })
})
