import { memoryRouter } from 'next-router-mock'
import { useQuery, type FC } from '@/common'
import {
    db,
    describe,
    expect,
    insertTestStudyJobData,
    it,
    mockSessionWithTestData,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import { queryKeys } from '@/lib/query-keys'
import { AgreementsPage } from './agreements-page'

// Records the URL at each refetch, so the test can tell whether the table refreshed before the push.
const ResearcherTable: FC<{ orgSlug: string; pathsAtRefetch: string[] }> = ({ orgSlug, pathsAtRefetch }) => {
    useQuery({
        queryKey: queryKeys.researcherOrgStudies(orgSlug),
        queryFn: async () => {
            pathsAtRefetch.push(memoryRouter.asPath)
            return []
        },
    })
    return null
}

describe('AgreementsPage', () => {
    it('records the ack and refreshes the researcher studies table before it moves on', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'lab' })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id })
        memoryRouter.setCurrentUrl('/agreements')
        const pathsAtRefetch: string[] = []

        renderWithProviders(
            <>
                <ResearcherTable orgSlug={org.slug} pathsAtRefetch={pathsAtRefetch} />
                <AgreementsPage isReviewer={false} studyId={study.id} proceedHref="/next" previousHref="/prev" />
            </>,
        )
        await waitFor(() => expect(pathsAtRefetch).toEqual(['/agreements']))

        await userEvent.click(screen.getByRole('button', { name: 'Proceed to Step 4' }))

        await waitFor(() => expect(memoryRouter.asPath).toBe('/next'))
        expect(pathsAtRefetch).toEqual(['/agreements', '/agreements'])
        const acked = await db
            .selectFrom('study')
            .select('researcherAgreementsAckedAt')
            .where('id', '=', study.id)
            .executeTakeFirstOrThrow()
        expect(acked.researcherAgreementsAckedAt).not.toBeNull()
    })
})
