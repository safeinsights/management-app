import {
    act,
    createTestQueryWrapper,
    db,
    describe,
    expect,
    insertTestStudyJobData,
    it,
    mockSessionWithTestData,
    renderHook,
    waitFor,
} from '@/tests/unit.helpers'
import { writeProposalSubmissionSnapshot } from '@/server/db/proposal-snapshot'
import { useStartProposalRevision } from './use-start-proposal-revision'

const setupChangeRequestedWithSnapshot = async (orgSlug: string) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug, orgType: 'lab' })
    const { study } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        studyStatus: 'CHANGE-REQUESTED',
        title: 'Original title',
    })
    await writeProposalSubmissionSnapshot(db, study.id, user.id)
    return { org, user, study }
}

const readStudy = (studyId: string) =>
    db
        .selectFrom('study')
        .select(['status', 'proposalRevisionBaseSubmissionId'])
        .where('id', '=', studyId)
        .executeTakeFirstOrThrow()

describe('useStartProposalRevision', () => {
    it('flips the study to a revision DRAFT on the first signalled edit when enabled', async () => {
        const { study } = await setupChangeRequestedWithSnapshot('lab-hook-flip')

        const { result } = renderHook(() => useStartProposalRevision({ studyId: study.id, enabled: true }), {
            wrapper: createTestQueryWrapper(),
        })

        await act(async () => {
            result.current.signalRealEdit()
        })
        await waitFor(() => expect(result.current.revisionStarted).toBe(true))

        const after = await readStudy(study.id)
        expect(after.status).toBe('DRAFT')
        expect(after.proposalRevisionBaseSubmissionId).not.toBeNull()
    })

    it('does nothing when disabled (fresh draft or already-started revision)', async () => {
        const { study } = await setupChangeRequestedWithSnapshot('lab-hook-disabled')

        const { result } = renderHook(() => useStartProposalRevision({ studyId: study.id, enabled: false }), {
            wrapper: createTestQueryWrapper(),
        })

        await act(async () => {
            result.current.signalRealEdit()
        })

        expect(result.current.isStartingRevision).toBe(false)
        const after = await readStudy(study.id)
        expect(after.status).toBe('CHANGE-REQUESTED')
        expect(after.proposalRevisionBaseSubmissionId).toBeNull()
    })

    it('fires the transition at most once even when signalled repeatedly', async () => {
        const { study } = await setupChangeRequestedWithSnapshot('lab-hook-once')

        const { result } = renderHook(() => useStartProposalRevision({ studyId: study.id, enabled: true }), {
            wrapper: createTestQueryWrapper(),
        })

        await act(async () => {
            result.current.signalRealEdit()
            result.current.signalRealEdit()
            result.current.signalRealEdit()
        })
        await waitFor(() => expect(result.current.revisionStarted).toBe(true))

        const snaps = await db
            .selectFrom('studyProposalSubmission')
            .select('id')
            .where('studyId', '=', study.id)
            .execute()
        // The action never writes a snapshot; the single pre-seeded one is all that should exist,
        // confirming repeated signals did not spawn extra work.
        expect(snaps).toHaveLength(1)
        expect((await readStudy(study.id)).status).toBe('DRAFT')
    })
})
