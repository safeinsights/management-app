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
import { MarkStudyOpened } from './mark-study-opened'

const openedAt = async (studyId: string, userId: string) =>
    (
        await db
            .selectFrom('studyLastOpened')
            .select('openedAt')
            .where('studyId', '=', studyId)
            .where('userId', '=', userId)
            .executeTakeFirst()
    )?.openedAt

// The action's guards are covered in study.actions.test.ts. What only the leaf can show is that
// entering and leaving the study both write the stamp.
describe('MarkStudyOpened', () => {
    it('records the visit on entering and again on leaving the study', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })

        const { unmount } = renderWithProviders(<MarkStudyOpened studyId={study.id} />)
        await waitFor(async () => expect(await openedAt(study.id, user.id)).toBeInstanceOf(Date))
        const entered = (await openedAt(study.id, user.id))!

        unmount()

        await waitFor(async () =>
            expect((await openedAt(study.id, user.id))!.getTime()).toBeGreaterThan(entered.getTime()),
        )
    })

    // Without this the dashboard and the side nav can show a dot for the study just left.
    it('invalidates the studies tables and the side nav once the visit is recorded', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })
        const queryClient = createTestQueryClient()
        queryClient.setQueryData(['researcher-studies', org.slug], [])
        queryClient.setQueryData(['user-reviewer-studies', user.id], [])
        queryClient.setQueryData(['nav-unread'], { myStudies: true, orgSlugs: [] })

        const { unmount } = renderWithProviders(<MarkStudyOpened studyId={study.id} />, { queryClient })

        await waitFor(() => {
            expect(queryClient.getQueryState(['researcher-studies', org.slug])?.isInvalidated).toBe(true)
            expect(queryClient.getQueryState(['user-reviewer-studies', user.id])?.isInvalidated).toBe(true)
            expect(queryClient.getQueryState(['nav-unread'])?.isInvalidated).toBe(true)
        })
        unmount()
        await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    })
})
