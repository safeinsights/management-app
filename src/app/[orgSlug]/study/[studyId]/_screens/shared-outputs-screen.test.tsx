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
import type { RawStudyState, ScreenId } from '@/lib/study-screen'
import { getStudyAction } from '@/server/actions/study.actions'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { SharedOutputsScreen } from './shared-outputs-screen'
import type { ScreenComponentProps } from './types'

const APPROVED_AT = new Date('2026-06-20T12:00:00Z')
const SUBMITTED_AT = new Date('2026-07-01T12:00:00Z')
const RUN_AT = new Date('2026-07-02T12:00:00Z')
const DECIDED_AT = new Date('2026-08-05T12:00:00Z')

const DASHBOARD_HREF = '/dashboard'

/**
 * One component now serves both share screens, so the wiring below is asserted once per variant
 * rather than in two mirror-image files (PR #1003 review). Each variant carries only what actually
 * differs: the run status that routes to it, its locked-banner copy, its feedback text, and the
 * adjacent outcomes that must NOT reach it.
 */
type Variant = {
    screen: Extract<ScreenId, 'outputs-shared' | 'outputs-errored-shared'>
    label: string
    /** The run status that, with FILES-APPROVED, routes to this screen. */
    runStatus: StudyJobStatus
    lockedTitle: string
    lockedBody: (dataPartner: string) => string
    feedbackBody: string
    /** Adjacent outcomes that must fall through to the not-found guard. */
    guardedAgainst: [string, StudyJobStatus[]][]
}

const VARIANTS: Variant[] = [
    {
        screen: 'outputs-shared',
        label: 'clean run, outputs shared (OTTER-688)',
        runStatus: 'RUN-COMPLETE',
        lockedTitle: 'Decrypt to view your outputs',
        lockedBody: (dataPartner) =>
            `${dataPartner} has reviewed and shared the outputs. Use your security key to decrypt and review them.`,
        feedbackBody: 'Reviewed and approved. The results meet the study criteria.',
        guardedAgainst: [
            ['a completed run still awaiting the reviewer files decision', ['RUN-COMPLETE']],
            ['an errored run whose outputs were shared, which has its own screen', ['JOB-ERRORED', 'FILES-APPROVED']],
            ['a clean run decided feedback-only', ['RUN-COMPLETE', 'FILES-REJECTED']],
            // Both FILES-* rows on one job: isOutputsSharedOutcome excludes resultsRejected so the
            // conservative feedback-only screen keeps it, agreeing with the pill, which reads Rejected.
            ['a job carrying both files decisions', ['RUN-COMPLETE', 'FILES-APPROVED', 'FILES-REJECTED']],
        ],
    },
    {
        screen: 'outputs-errored-shared',
        label: 'errored run, outputs shared (OTTER-696)',
        runStatus: 'JOB-ERRORED',
        lockedTitle: 'Decrypt outputs to view code error',
        lockedBody: (dataPartner) =>
            `${dataPartner} has shared the outputs and feedback. Enter your security key below to decrypt and diagnose the issue.`,
        feedbackBody: 'The run failed on the join; the logs are in the outputs.',
        guardedAgainst: [
            ['an errored run still awaiting the reviewer files decision', ['JOB-ERRORED']],
            ['a clean approved run, which has its own outputs-shared screen', ['RUN-COMPLETE', 'FILES-APPROVED']],
            ['an errored run decided feedback-only', ['JOB-ERRORED', 'FILES-REJECTED']],
        ],
    },
]

const renderScreen = async (
    variant: Variant,
    study: ScreenComponentProps['study'],
    raw: RawStudyState,
    orgSlug: string,
    returnTo?: 'org',
) =>
    renderWithProviders(
        await SharedOutputsScreen({
            descriptor: { screen: variant.screen },
            study,
            raw,
            orgSlug,
            dashboardHref: DASHBOARD_HREF,
            returnTo,
        }),
    )

// The run status plus FILES-APPROVED and a RESULTS decision comment — the state that routes here.
const setupShared = async (variant: Variant, { withNote = false }: { withNote?: boolean } = {}) => {
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
        .values({ studyJobId: job.id, status: variant.runStatus, createdAt: RUN_AT })
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
            body: JSON.parse(lexicalJson(variant.feedbackBody)),
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

describe.each(VARIANTS)('SharedOutputsScreen — $label', (variant) => {
    // The two-phase behaviour — banner swap, live-region identity, key form removal, outputs table,
    // post-decryption nav — is the panel's contract and is covered in shared-outputs-panel.test.tsx.
    // What is this screen's own job is the wiring: THIS study's title, partner, decision date and
    // routing predicate.
    it('wires the page header and the study title through to the section header', async () => {
        const { org, study, raw } = await setupShared(variant)
        await renderScreen(variant, study, raw, org.slug)

        expect(screen.getByRole('heading', { level: 1, name: 'Secondary analysis study' })).toBeInTheDocument()
        const header = screen.getByTestId('proposal-section-header')
        expect(header).toHaveTextContent('STEP 4')
        expect(header).toHaveTextContent('Verify outputs')
        expect(header).toHaveTextContent(study.title!)
    })

    it('renders the pre-decryption action banner with this screen’s copy and the partner name', async () => {
        const { org, study, raw } = await setupShared(variant)
        await renderScreen(variant, study, raw, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveAttribute('data-variant', 'action')
        expect(alert).toHaveTextContent(variant.lockedTitle)
        expect(alert).toHaveTextContent(variant.lockedBody(displayOrgName(org.name)))
    })

    it('does not render the sibling screen’s banner title', async () => {
        const sibling = VARIANTS.find((v) => v.screen !== variant.screen)!
        const { org, study, raw } = await setupShared(variant)
        await renderScreen(variant, study, raw, org.slug)

        expect(screen.getByTestId('status-alert')).not.toHaveTextContent(sibling.lockedTitle)
    })

    it('dates the banner from the FILES-APPROVED decision — not the run, code approval, or today', async () => {
        const { org, study, raw } = await setupShared(variant)
        await renderScreen(variant, study, raw, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent(dayjs(DECIDED_AT).format('MMM DD, YYYY'))
        expect(alert).not.toHaveTextContent(dayjs(RUN_AT).format('MMM DD, YYYY'))
        expect(alert).not.toHaveTextContent(dayjs(APPROVED_AT).format('MMM DD, YYYY'))
        expect(alert).not.toHaveTextContent(dayjs(new Date()).format('MMM DD, YYYY'))
    })

    it('degrades to an undated banner when the payload job carries no dated FILES-APPROVED row', async () => {
        const { org, study, raw } = await setupShared(variant)
        // Strip only the timestamp: routing still lands here, but the payload cannot date the banner.
        const undated = {
            ...raw,
            jobs: raw.jobs.map((j) => ({
                ...j,
                statusChanges: j.statusChanges.map((c) => (c.status === 'FILES-APPROVED' ? { status: c.status } : c)),
            })),
        }
        await renderScreen(variant, study, undated, org.slug)

        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveTextContent(variant.lockedTitle)
        expect(alert).not.toHaveTextContent('•')
    })

    it("renders the reused feedback-and-notes section with this study's outputs feedback", async () => {
        const { org, user, study, raw } = await setupShared(variant, { withNote: true })
        await renderScreen(variant, study, raw, org.slug)

        const section = screen.getByTestId('feedback-and-notes-section')
        expect(section).toHaveTextContent('Reviewer feedback (v1.0)')
        expect(section).toHaveTextContent(variant.feedbackBody)
        expect(section).toHaveTextContent('Resubmission note (v1.0)')
        expect(section).toHaveTextContent('Adjusted the aggregation query.')
        expect(section).toHaveTextContent(user.fullName)
        expect(screen.getAllByTestId('entry-divider')).toHaveLength(1)
    })

    it("shows only this study's feedback, not another study's", async () => {
        const { org, user, study, raw } = await setupShared(variant)
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

        await renderScreen(variant, study, raw, org.slug)

        expect(screen.getByText(variant.feedbackBody)).toBeInTheDocument()
        expect(screen.queryByText('Feedback that belongs to the other study.')).not.toBeInTheDocument()
    })

    it('does not surface code-review feedback in the outputs thread', async () => {
        const { org, user, study, raw, job } = await setupShared(variant)
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

        await renderScreen(variant, study, raw, org.slug)

        expect(screen.queryByText('Code-step approval feedback.')).not.toBeInTheDocument()
    })

    it('renders the key gate and points Previous step at this study', async () => {
        const { org, study, raw } = await setupShared(variant)
        await renderScreen(variant, study, raw, org.slug)

        expect(await screen.findByTestId('security-key-form')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /previous step/i })).toHaveAttribute(
            'href',
            `/${org.slug}/study/${study.id}/view/code`,
        )
    })

    it('passes returnTo through to the Previous step link', async () => {
        const { org, study, raw } = await setupShared(variant)
        await renderScreen(variant, study, raw, org.slug, 'org')

        expect(screen.getByRole('link', { name: /previous step/i })).toHaveAttribute(
            'href',
            `/${org.slug}/study/${study.id}/view/code?returnTo=org`,
        )
    })

    it('short-circuits on the routing guard for a study with no job (no shared outputs to show)', async () => {
        const { org, study } = await setupStudyAction({ orgSlug: 'test-lab', orgType: 'lab', createJob: false })
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
        const raw = await requireRawState(study.id)
        await renderScreen(variant, study, raw, org.slug)
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
        await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: variant.runStatus }).execute()
        await db.insertInto('jobStatusChange').values({ studyJobId: job.id, status: 'FILES-APPROVED' }).execute()
        const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        const raw = await requireRawState(dbStudy.id)
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })

        await renderScreen(variant, study, raw, org.slug)

        expect(screen.getByText('No submission found')).toBeInTheDocument()
    })

    // Adjacent outcomes that must NOT route here. The sibling share screen is the closest: it renders
    // this very component, so cross-routing would be silent apart from the banner copy.
    it.each(variant.guardedAgainst)('guards against rendering for %s', async (_label, statuses) => {
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
        await renderScreen(variant, study, raw, org.slug)

        expect(screen.getByText('Outputs not found')).toBeInTheDocument()
        expect(screen.queryByTestId('status-alert')).not.toBeInTheDocument()
    })
})
