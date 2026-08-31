import {
    actionResult,
    describe,
    expect,
    insertTestStudyJobData,
    it,
    type Mock,
    mockSessionWithTestData,
    renderWithProviders,
    requireRawState,
    screen,
} from '@/tests/unit.helpers'
import { useParams } from 'next/navigation'
import type { StudyJobStatus } from '@/database/types'
import dayjs from 'dayjs'
import { db } from '@/database'
import { lexicalJson } from '@/lib/lexical'
import { displayOrgName } from '@/lib/string'
import type { RawStudyState } from '@/lib/study-screen'
import { getStudyAction } from '@/server/actions/study.actions'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { OutputsSharedScreen } from './outputs-shared-screen'
import type { ScreenComponentProps } from './types'

const APPROVED_AT = new Date('2026-06-20T12:00:00Z')
const SUBMITTED_AT = new Date('2026-07-01T12:00:00Z')
const COMPLETED_AT = new Date('2026-07-02T12:00:00Z')
const DECIDED_AT = new Date('2026-08-05T12:00:00Z')

const DASHBOARD_HREF = '/dashboard'

const BANNER_BODY = (dataPartner: string) =>
    `${dataPartner} has reviewed and shared the outputs. Use your security key to decrypt and review them.`

const renderScreen = async (
    study: ScreenComponentProps['study'],
    raw: RawStudyState,
    orgSlug: string,
    returnTo?: 'org',
) => renderWithProviders(await OutputsSharedScreen({ study, raw, orgSlug, dashboardHref: DASHBOARD_HREF, returnTo }))

// Clean run + "Share outputs and feedback": RUN-COMPLETE plus FILES-APPROVED and a RESULTS decision
// comment (OTTER-688).
const setupOutputsShared = async ({ withNote = false }: { withNote?: boolean } = {}) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
    const { study: dbStudy, job } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        jobStatus: 'CODE-SUBMITTED',
    })

    // Pin timestamps: rows written in one test transaction tie on now(), which would make the
    // banner date and entry order non-deterministic.
    await db
        .updateTable('jobStatusChange')
        .set({ createdAt: SUBMITTED_AT })
        .where('studyJobId', '=', job.id)
        .where('status', '=', 'CODE-SUBMITTED')
        .execute()
    await db
        .insertInto('jobStatusChange')
        .values({ studyJobId: job.id, status: 'CODE-APPROVED', userId: user.id, createdAt: APPROVED_AT })
        .execute()
    await db
        .insertInto('jobStatusChange')
        .values({ studyJobId: job.id, status: 'RUN-COMPLETE', createdAt: COMPLETED_AT })
        .execute()
    await db
        .insertInto('jobStatusChange')
        .values({ studyJobId: job.id, status: 'FILES-APPROVED', userId: user.id, createdAt: DECIDED_AT })
        .execute()
    await db
        .insertInto('studyReviewComment')
        .values({
            studyId: dbStudy.id,
            studyJobId: job.id,
            authorId: user.id,
            reviewKind: 'RESULTS',
            entryType: 'DECISION',
            decision: 'APPROVE',
            body: JSON.parse(lexicalJson('Reviewed and approved. The results meet the study criteria.')),
            round: 1,
            createdAt: DECIDED_AT,
        })
        .execute()
    if (withNote) {
        await db
            .updateTable('studyJob')
            .set({ resubmissionNote: JSON.parse(lexicalJson('Adjusted the aggregation query.')), resubmissionRound: 1 })
            .where('id', '=', job.id)
            .execute()
    }

    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    const raw = await requireRawState(dbStudy.id)
    ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
    return { org, user, study, raw, job }
}

describe('OutputsSharedScreen', () => {
    // The two-phase behaviour — banner swap, live-region identity, key form removal, outputs table,
    // post-decryption nav — is the panel's contract and is covered in shared-outputs-panel.test.tsx.
    // What is this screen's own job is the wiring: THIS study's title, partner, decision date and
    // routing predicate.
    it('wires the page header and the study title through to the section header', async () => {
        const { org, study, raw } = await setupOutputsShared()
        await renderScreen(study, raw, org.slug)

        expect(screen.getByRole('heading', { level: 1, name: 'Secondary analysis study' })).toBeInTheDocument()
        const header = screen.getByTestId('proposal-section-header')
        expect(header).toHaveTextContent('STEP 4')
        expect(header).toHaveTextContent('Verify outputs')
        expect(header).toHaveTextContent(study.title!)
    })

    it('renders the pre-decryption action banner with this card’s copy and the partner name', async () => {
        const { org, study, raw } = await setupOutputsShared()
        await renderScreen(study, raw, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveAttribute('data-variant', 'action')
        expect(alert).toHaveTextContent('Decrypt to view your outputs')
        expect(alert).toHaveTextContent(BANNER_BODY(displayOrgName(org.name)))
    })

    it('dates the banner from the FILES-APPROVED decision — not the run, code approval, or today', async () => {
        const { org, study, raw } = await setupOutputsShared()
        await renderScreen(study, raw, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent(dayjs(DECIDED_AT).format('MMM DD, YYYY'))
        expect(alert).not.toHaveTextContent(dayjs(COMPLETED_AT).format('MMM DD, YYYY'))
        expect(alert).not.toHaveTextContent(dayjs(APPROVED_AT).format('MMM DD, YYYY'))
        expect(alert).not.toHaveTextContent(dayjs(new Date()).format('MMM DD, YYYY'))
    })

    it('degrades to an undated banner when the payload job carries no dated FILES-APPROVED row', async () => {
        const { org, study, raw } = await setupOutputsShared()
        // Strip only the timestamp: routing still lands here, but the payload cannot date the banner.
        const undated = {
            ...raw,
            jobs: raw.jobs.map((j) => ({
                ...j,
                statusChanges: j.statusChanges.map((c) => (c.status === 'FILES-APPROVED' ? { status: c.status } : c)),
            })),
        }
        await renderScreen(study, undated, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent('Decrypt to view your outputs')
        expect(alert).not.toHaveTextContent('•')
    })

    it("renders the reused feedback-and-notes section with this study's outputs feedback", async () => {
        const { org, user, study, raw } = await setupOutputsShared({ withNote: true })
        await renderScreen(study, raw, org.slug)

        const section = screen.getByTestId('feedback-and-notes-section')
        expect(section).toHaveTextContent('Reviewer feedback (v1.0)')
        expect(section).toHaveTextContent('Reviewed and approved. The results meet the study criteria.')
        expect(section).toHaveTextContent('Resubmission note (v1.0)')
        expect(section).toHaveTextContent('Adjusted the aggregation query.')
        expect(section).toHaveTextContent(user.fullName)
        expect(screen.getAllByTestId('entry-divider')).toHaveLength(1)
    })

    it("shows only this study's feedback, not another study's", async () => {
        const { org, user, study, raw } = await setupOutputsShared()
        const { study: otherStudy, job: otherJob } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            jobStatus: 'CODE-SUBMITTED',
        })
        await db
            .insertInto('studyReviewComment')
            .values({
                studyId: otherStudy.id,
                studyJobId: otherJob.id,
                authorId: user.id,
                reviewKind: 'RESULTS',
                entryType: 'DECISION',
                decision: 'APPROVE',
                body: JSON.parse(lexicalJson('Feedback that belongs to the other study.')),
                round: 1,
            })
            .execute()

        await renderScreen(study, raw, org.slug)

        expect(screen.getByText('Reviewed and approved. The results meet the study criteria.')).toBeInTheDocument()
        expect(screen.queryByText('Feedback that belongs to the other study.')).not.toBeInTheDocument()
    })

    it('does not surface code-review feedback in the outputs thread', async () => {
        const { org, user, study, raw, job } = await setupOutputsShared()
        await db
            .insertInto('studyReviewComment')
            .values({
                studyId: study.id,
                studyJobId: job.id,
                authorId: user.id,
                reviewKind: 'CODE',
                entryType: 'DECISION',
                decision: 'APPROVE',
                body: JSON.parse(lexicalJson('Code-step approval feedback.')),
                round: 1,
            })
            .execute()

        await renderScreen(study, raw, org.slug)

        expect(screen.queryByText('Code-step approval feedback.')).not.toBeInTheDocument()
    })

    it('renders the key gate and points Previous step at this study', async () => {
        const { org, study, raw } = await setupOutputsShared()
        await renderScreen(study, raw, org.slug)

        expect(await screen.findByTestId('security-key-form')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /previous step/i })).toHaveAttribute(
            'href',
            `/${org.slug}/study/${study.id}/view/code`,
        )
    })

    it('passes returnTo through to the Previous step link', async () => {
        const { org, study, raw } = await setupOutputsShared()
        await renderScreen(study, raw, org.slug, 'org')

        expect(screen.getByRole('link', { name: /previous step/i })).toHaveAttribute(
            'href',
            `/${org.slug}/study/${study.id}/view/code?returnTo=org`,
        )
    })

    it('short-circuits on the routing guard for a study with no job (no shared outputs to show)', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'test-lab', orgType: 'lab', createJob: false })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
        const raw = await requireRawState(study.id)
        await renderScreen(study, raw, org.slug)
        expect(screen.getByText('Outputs not found')).toBeInTheDocument()
    })

    it('shows the no-submission alert for a titleless draft even when its job carries the decision statuses', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
        const { study: dbStudy, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            studyStatus: 'DRAFT',
            jobStatus: 'CODE-SUBMITTED',
        })
        await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'RUN-COMPLETE' }).execute()
        await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'FILES-APPROVED' }).execute()
        const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        const raw = await requireRawState(dbStudy.id)
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        await renderScreen(study, raw, org.slug)

        expect(screen.getByText('No submission found')).toBeInTheDocument()
    })

    // Adjacent outcomes that must NOT route here. The errored share is the closest: it renders a
    // near-identical outputs-and-feedback page from the same panel, so cross-routing would be silent
    // apart from the banner copy.
    const renderWithStatuses = async (statuses: StudyJobStatus[]) => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
        const { study: dbStudy, job } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            jobStatus: 'CODE-SUBMITTED',
        })
        for (const status of statuses) {
            await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status }).execute()
        }
        const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        const raw = await requireRawState(dbStudy.id)
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
        await renderScreen(study, raw, org.slug)
    }

    it.each([
        ['a completed run still awaiting the reviewer files decision', ['RUN-COMPLETE']],
        ['an errored run whose outputs were shared, which has its own screen', ['JOB-ERRORED', 'FILES-APPROVED']],
        ['a clean run decided feedback-only', ['RUN-COMPLETE', 'FILES-REJECTED']],
        // Both FILES-* rows on one job: isOutputsSharedOutcome excludes resultsRejected so the
        // conservative feedback-only screen keeps it, agreeing with the pill, which reads Rejected.
        ['a job carrying both files decisions', ['RUN-COMPLETE', 'FILES-APPROVED', 'FILES-REJECTED']],
    ] as [string, StudyJobStatus[]][])('guards against rendering for %s', async (_label, statuses) => {
        await renderWithStatuses(statuses)

        expect(screen.getByText('Outputs not found')).toBeInTheDocument()
        expect(screen.queryByTestId('status-alert')).not.toBeInTheDocument()
    })
})
