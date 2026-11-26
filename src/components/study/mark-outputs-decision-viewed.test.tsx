import {
    captureStudyEvents,
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
import { queryKeys } from '@/lib/query-keys'

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

    // Without it this tab would treat its own job-status event as news and refresh the page in use.
    it("sends this tab's id with the write", async () => {
        const events = captureStudyEvents()
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'FILES-REJECTED' })

        renderWithProviders(<MarkOutputsDecisionViewed studyId={study.id} />)

        await waitFor(async () => expect(await viewedRows(job.id)).toHaveLength(1))
        expect(events.events).toEqual([
            expect.objectContaining({ jobId: job.id, change: 'job-status', originTabId: expect.any(String) }),
        ])
    })

    // Without this the in-app route back reads a dashboard row cached before the write.
    it('invalidates the researcher dashboard rows once the view is recorded', async () => {
        const { org } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study, job } = await insertTestStudyJobData({ org, jobStatus: 'FILES-REJECTED' })
        const queryClient = createTestQueryClient()
        queryClient.setQueryData(queryKeys.researcherUserStudies(), [])
        queryClient.setQueryData(queryKeys.researcherOrgStudies(org.slug), [])

        renderWithProviders(<MarkOutputsDecisionViewed studyId={study.id} />, { queryClient })

        await waitFor(async () => expect(await viewedRows(job.id)).toHaveLength(1))
        await waitFor(() => {
            expect(queryClient.getQueryState(queryKeys.researcherUserStudies())?.isInvalidated).toBe(true)
            expect(queryClient.getQueryState(queryKeys.researcherOrgStudies(org.slug))?.isInvalidated).toBe(true)
        })
    })
})
