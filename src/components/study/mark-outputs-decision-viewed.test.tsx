import {
    createTestQueryClient,
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

// The action's own guards (no decision yet, wrong org, errored, still encrypted) are covered in
// study-job.actions.test.ts. What only the leaf can show is that mounting it fires the write; the
// feedback-only screen is its one caller, since shared outputs count once decrypted (OTTER-999).
describe('MarkOutputsDecisionViewed', () => {
    it('records the lab view of a released decision once it is on screen', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'FILES-REJECTED' })

        renderWithProviders(<MarkOutputsDecisionViewed studyId={study.id} />)

        await waitFor(async () => expect(await viewedRows(job.id)).toHaveLength(1))
    })

    // Without this the in-app route back reads a dashboard row cached before the write.
    it('invalidates the researcher dashboard rows once the view is recorded', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'FILES-REJECTED' })
        const queryClient = createTestQueryClient()
        queryClient.setQueryData(['user-researcher-studies'], [])
        queryClient.setQueryData(['researcher-studies', org.slug], [])

        renderWithProviders(<MarkOutputsDecisionViewed studyId={study.id} />, { queryClient })

        await waitFor(async () => expect(await viewedRows(job.id)).toHaveLength(1))
        await waitFor(() => {
            expect(queryClient.getQueryState(['user-researcher-studies'])?.isInvalidated).toBe(true)
            expect(queryClient.getQueryState(['researcher-studies', org.slug])?.isInvalidated).toBe(true)
        })
    })
})
