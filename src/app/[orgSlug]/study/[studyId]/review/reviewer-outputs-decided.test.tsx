import { describe, expect, it, type Mock } from 'vitest'
import { useParams } from 'next/navigation'
import dayjs from 'dayjs'
import {
    actionResult,
    db,
    insertTestStudyJobData,
    mockSessionWithTestData,
    renderWithProviders,
    requireRawState,
    screen,
} from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/lexical'
import type { StudyJobStatus } from '@/database/types'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { getStudyAction } from '@/server/actions/study.actions'
import type { RawStudyState } from '@/lib/study-screen'
import { Routes } from '@/lib/routes'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { seedJobFileRow } from '@/tests/artifact.helpers'
import { ReviewerOutputsDecided } from './reviewer-outputs-decided'

const setupDecided = async ({
    jobStatus = 'RUN-COMPLETE' as StudyJobStatus,
    filesDecision = 'FILES-APPROVED' as StudyJobStatus,
} = {}) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
    const { study: dbStudy } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus })
    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))

    const job = await db
        .selectFrom('studyJob')
        .where('studyId', '=', dbStudy.id)
        .selectAll('studyJob')
        .executeTakeFirstOrThrow()

    await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: filesDecision }).execute()

    const raw = await requireRawState(dbStudy.id)
    ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
    return { org, user, study, job, raw }
}

const renderView = async (study: SelectedStudy, raw: RawStudyState, orgSlug: string) =>
    renderWithProviders(await ReviewerOutputsDecided({ study, raw, orgSlug }))

describe('ReviewerOutputsDecided', () => {
    it('renders the shared page and section headers', async () => {
        const { org, study, raw } = await setupDecided()
        await renderView(study, raw, org.slug)

        expect(screen.getByRole('heading', { level: 1, name: study.title! })).toBeInTheDocument()
        expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('STEP 3')
        expect(screen.getByTestId('proposal-section-header')).toHaveTextContent('Review outputs')
    })

    it('shows the decided banner with date for FILES-APPROVED on a completed run', async () => {
        const { org, study, raw } = await setupDecided()
        await renderView(study, raw, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent(`Outputs and feedback shared • ${dayjs().format('MMM DD, YYYY')}`)
        expect(alert).toHaveTextContent(
            `The outputs from the latest code run were reviewed and shared with ${study.submittingLabName} along with your feedback.`,
        )
    })

    it('shows the feedback-only banner for FILES-REJECTED on a completed run', async () => {
        const { org, study, raw } = await setupDecided({ filesDecision: 'FILES-REJECTED' })
        await renderView(study, raw, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent(`Feedback shared • ${dayjs().format('MMM DD, YYYY')}`)
        expect(alert).toHaveTextContent(`Feedback has been shared with ${study.submittingLabName} without the outputs.`)
    })

    it('shows the errored + outputs-shared banner for FILES-APPROVED on an errored run', async () => {
        const { org, study, raw } = await setupDecided({
            jobStatus: 'JOB-ERRORED',
            filesDecision: 'FILES-APPROVED',
        })
        await renderView(study, raw, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent('Code errored. Outputs and feedback shared')
        expect(alert).toHaveTextContent(
            `The study code failed to process. Outputs and feedback have been shared with ${study.submittingLabName}.`,
        )
    })

    it('shows the errored + feedback-only banner for FILES-REJECTED on an errored run', async () => {
        const { org, study, raw } = await setupDecided({
            jobStatus: 'JOB-ERRORED',
            filesDecision: 'FILES-REJECTED',
        })
        await renderView(study, raw, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent('Code errored. Feedback shared')
        expect(alert).toHaveTextContent(
            `The study code failed to process. Feedback has been shared with ${study.submittingLabName} without the outputs.`,
        )
    })

    it('links Previous step to the read-only code page for this study', async () => {
        const { org, study, raw } = await setupDecided()
        await renderView(study, raw, org.slug)

        expect(screen.getByRole('link', { name: /previous step/i })).toHaveAttribute(
            'href',
            `/${org.slug}/study/${study.id}/review/code`,
        )
    })

    it('renders Back to my studies as a filled link to the personal dashboard', async () => {
        const { org, study, raw } = await setupDecided()
        await renderView(study, raw, org.slug)

        const link = screen.getByRole('link', { name: /back to my studies/i })
        expect(link).toHaveAttribute('href', Routes.dashboard)
    })

    it('shows a not-found alert when the study has no submitted job', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'openstax', orgType: 'enclave', createJob: false })
        const raw = await requireRawState(study.id)
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
        await renderView(study, raw, org.slug)
        expect(screen.getByText('No submission found')).toBeInTheDocument()
    })

    it('shows a not-found alert when hasResults is false', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'openstax', orgType: 'enclave' })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            jobStatus: 'CODE-SUBMITTED',
        })
        const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        const raw = await requireRawState(dbStudy.id)
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
        await renderView(study, raw, org.slug)
        expect(screen.getByText('No decision found')).toBeInTheDocument()
    })

    it('renders the Feedback and notes section with reviewer feedback entries', async () => {
        const { org, user, study, job, raw } = await setupDecided()
        await db
            .insertInto('studyReviewComment')
            .values({
                studyId: study.id,
                studyJobId: job.id,
                authorId: user.id,
                reviewKind: 'RESULTS',
                entryType: 'DECISION',
                decision: 'APPROVE',
                body: { root: { type: 'root', children: [] } },
                round: 1,
            })
            .execute()

        await renderView(study, raw, org.slug)

        expect(screen.getByTestId('feedback-and-notes-section')).toBeInTheDocument()
        expect(screen.getByText('Reviewer feedback (v1.0)')).toBeInTheDocument()
    })

    it('displays the author name and date for a feedback entry', async () => {
        const { org, user, study, job, raw } = await setupDecided()
        await db
            .insertInto('studyReviewComment')
            .values({
                studyId: study.id,
                studyJobId: job.id,
                authorId: user.id,
                reviewKind: 'RESULTS',
                entryType: 'DECISION',
                decision: 'APPROVE',
                body: JSON.parse(lexicalJson('Looks good overall.')),
                round: 1,
            })
            .execute()

        await renderView(study, raw, org.slug)

        const entry = screen.getByTestId('feedback-entries')
        expect(entry).toHaveTextContent(user.fullName)
        expect(entry).toHaveTextContent(dayjs().format('MMM DD, YYYY'))
    })

    it('renders a divider between multiple feedback entries', async () => {
        const { org, user, study, job, raw } = await setupDecided()
        await db
            .insertInto('studyReviewComment')
            .values([
                {
                    studyId: study.id,
                    studyJobId: job.id,
                    authorId: user.id,
                    reviewKind: 'RESULTS',
                    entryType: 'DECISION',
                    decision: 'APPROVE',
                    body: JSON.parse(lexicalJson('Round one feedback.')),
                    round: 1,
                },
                {
                    studyId: study.id,
                    studyJobId: job.id,
                    authorId: user.id,
                    reviewKind: 'RESULTS',
                    entryType: 'DECISION',
                    decision: 'REJECT',
                    body: JSON.parse(lexicalJson('Round two feedback.')),
                    round: 2,
                },
            ])
            .execute()

        await renderView(study, raw, org.slug)

        expect(screen.getAllByTestId('entry-divider')).toHaveLength(1)
    })

    it('hides the Feedback and notes section when there are no entries', async () => {
        const { org, study, raw } = await setupDecided()
        await renderView(study, raw, org.slug)

        expect(screen.queryByTestId('feedback-and-notes-section')).not.toBeInTheDocument()
    })

    it('renders the View outputs again security-key section', async () => {
        const { org, study, job, raw } = await setupDecided()
        await seedJobFileRow(job.id, 'ENCRYPTED-RESULT', 'encrypted-results.zip')
        await renderView(study, raw, org.slug)

        expect(screen.getByRole('heading', { name: /view outputs again/i })).toBeInTheDocument()
        expect(
            screen.getByText('The outputs are encrypted. Enter your security key to view them again.'),
        ).toBeInTheDocument()
    })

    // A submission-time scan log is not this run's outputs, so the form must not offer it as one.
    it('omits the security-key section when the only encrypted artifact is a scan log', async () => {
        const { org, study, job, raw } = await setupDecided()
        await seedJobFileRow(job.id, 'ENCRYPTED-SECURITY-SCAN-LOG', 'encrypted-scan-log.txt')
        await renderView(study, raw, org.slug)

        expect(screen.queryByRole('heading', { name: /view outputs again/i })).not.toBeInTheDocument()
        expect(screen.queryByTestId('security-key-form')).not.toBeInTheDocument()
    })

    // OTTER-524: an errored run can be closed out with nothing to decrypt, so asking for a key
    // would pose a demand no key can satisfy.
    it('omits the security-key section when the decided run left nothing to decrypt', async () => {
        const { org, study, raw } = await setupDecided({ jobStatus: 'JOB-ERRORED', filesDecision: 'FILES-REJECTED' })
        await renderView(study, raw, org.slug)

        expect(screen.queryByRole('heading', { name: /view outputs again/i })).not.toBeInTheDocument()
        expect(screen.queryByTestId('security-key-form')).not.toBeInTheDocument()
    })

    it('renders Previous step as a subtle-variant link', async () => {
        const { org, study, raw } = await setupDecided()
        await renderView(study, raw, org.slug)

        expect(screen.getByRole('link', { name: /previous step/i })).toHaveAttribute('data-variant', 'subtle')
    })

    it('renders Back to my studies as a filled-variant link that is enabled by default', async () => {
        const { org, study, raw } = await setupDecided()
        await renderView(study, raw, org.slug)

        const link = screen.getByRole('link', { name: /back to my studies/i })
        expect(link).toHaveAttribute('data-variant', 'filled')
        expect(link).not.toHaveAttribute('data-disabled')
    })
})
