import {
    actionResult,
    describe,
    expect,
    insertTestOrg,
    insertTestStudyJobData,
    it,
    type Mock,
    mockSessionWithTestData,
    renderWithProviders,
    requireRawState,
    screen,
} from '@/tests/unit.helpers'
import type { Route } from 'next'
import { useParams } from 'next/navigation'
import dayjs from 'dayjs'
import { db } from '@/database'
import { displayOrgName } from '@/lib/string'
import { researcherOutputsAwaitingReviewBanner } from '@/lib/study-banners'
import { getStudyAction } from '@/server/actions/study.actions'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { OutputsAwaitingReviewScreen } from './outputs-awaiting-review-screen'
import { screenNavProps } from './render-screen'
import type { ScreenComponentProps } from './types'

const DASHBOARD_HREF: Route = '/dashboard'

const renderScreen = async (
    study: ScreenComponentProps['study'],
    orgSlug: string,
    dashboardHref = DASHBOARD_HREF,
    returnTo?: 'org',
) => {
    const raw = await requireRawState(study.id)
    const ctx = { orgSlug, studyId: study.id, dashboardHref, returnTo }
    return renderWithProviders(
        await OutputsAwaitingReviewScreen({
            study,
            raw,
            ...screenNavProps('researcher', 'outputs-awaiting-review', raw, ctx),
        }),
    )
}

// The run finished and the reviewer has recorded no FILES-* decision, which is what routes here.
const setupAwaitingReview = async ({
    completedAt,
    dataPartnerName,
}: { completedAt?: Date; dataPartnerName?: string } = {}) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
    // orgId is the data partner, submittedByOrgId the research lab, so a separate org proves the
    // banner names the reviewing partner rather than the lab.
    const dataPartner = dataPartnerName ? await insertTestOrg({ slug: 'test-partner', name: dataPartnerName }) : org
    const { study: dbStudy, job } = await insertTestStudyJobData({
        org: dataPartner,
        researcherId: user.id,
        jobStatus: 'JOB-RUNNING',
    })
    await db.updateTable('study').set({ submittedByOrgId: org.id }).where('id', '=', dbStudy.id).execute()
    await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'CODE-APPROVED' }).execute()
    await db
        .insertInto('jobStatusChange')
        .values({ studyJobId: job.id, status: 'RUN-COMPLETE', ...(completedAt ? { createdAt: completedAt } : {}) })
        .execute()

    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
    return { org, dataPartner, study, job }
}

describe('OutputsAwaitingReviewScreen', () => {
    it('renders STEP 4 "Verify outputs"', async () => {
        const { org, study } = await setupAwaitingReview()
        await renderScreen(study, org.slug)

        expect(screen.getByRole('heading', { level: 1, name: study.title! })).toBeInTheDocument()
        expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('STEP 4')
        expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('Verify outputs')
    })

    it('names the reviewing data partner in the banner title and body', async () => {
        const { org, study } = await setupAwaitingReview({ dataPartnerName: 'Openstax Data Partner' })
        await renderScreen(study, org.slug)

        const copy = researcherOutputsAwaitingReviewBanner({ dataPartner: displayOrgName(study.orgName) })
        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent(copy.title)
        expect(alert).toHaveTextContent(copy.body)
        expect(alert).toHaveAttribute('data-variant', 'informative')
    })

    it('dates the banner from the RUN-COMPLETE row', async () => {
        const completedAt = new Date('2026-06-15T12:00:00Z')
        const { org, study } = await setupAwaitingReview({ completedAt })
        await renderScreen(study, org.slug)

        expect(screen.getByTestId('status-alert')).toHaveTextContent(dayjs(completedAt).format('MMM DD, YYYY'))
    })

    it('tells the researcher the outputs are not released yet, without promising a decision', async () => {
        const { org, study } = await setupAwaitingReview()
        await renderScreen(study, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent('Reviews typically take 7 to 10 days.')
        expect(alert).not.toHaveTextContent(/running in the secure enclave/)
    })

    it('wires Previous step to the code step and forward to the dashboard', async () => {
        const { org, study } = await setupAwaitingReview()
        await renderScreen(study, org.slug)

        expect(screen.getByRole('link', { name: /previous step/i })).toHaveAttribute(
            'href',
            `/${org.slug}/study/${study.id}/view/code`,
        )
        expect(screen.getByTestId('cta-back-to-my-studies')).toBeInTheDocument()
    })

    it('refuses to render once the reviewer has decided, so it cannot disagree with the rule table', async () => {
        const { org, study, job } = await setupAwaitingReview()
        await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'FILES-APPROVED' }).execute()
        await renderScreen(study, org.slug)

        expect(screen.queryByTestId('status-alert')).not.toBeInTheDocument()
        expect(screen.getByText('Outputs not found')).toBeInTheDocument()
    })

    it('refuses to render for a study with no job, which has no outputs to await', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'test-lab', orgType: 'lab', createJob: false })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
        await renderScreen(study, org.slug)

        expect(screen.queryByTestId('status-alert')).not.toBeInTheDocument()
        expect(screen.getByText('Outputs not found')).toBeInTheDocument()
    })
})
