import {
    db,
    describe,
    expect,
    insertTestStudyJobData,
    it,
    mockSessionWithTestData,
    renderWithProviders,
    waitFor,
} from '@/tests/unit.helpers'
import { MarkOutputsDecisionViewed } from './mark-outputs-decision-viewed'

const viewedRows = (jobId: string) =>
    db
        .selectFrom('jobStatusChange')
        .select('status')
        .where('studyJobId', '=', jobId)
        .where('status', '=', 'RESULTS-VIEWED')
        .execute()

// The action's own guards (no decision yet, wrong org, already recorded) are covered in
// study-job.actions.test.ts. What only the leaf can show is that mounting it fires the write.
describe('MarkOutputsDecisionViewed', () => {
    it('records the lab view of a released decision once it is on screen', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'FILES-APPROVED' })

        renderWithProviders(<MarkOutputsDecisionViewed studyId={study.id} />)

        await waitFor(async () => expect(await viewedRows(job.id)).toHaveLength(1))
    })
})
