import {
    actionResult,
    describe,
    expect,
    fireEvent,
    insertTestCodeResubmissionNote,
    insertTestJobStatus,
    insertTestJobStatuses,
    insertTestStudyJobData,
    type PriorCodeRunOptions,
    it,
    type Mock,
    mockSessionWithTestData,
    readTestSupportFile,
    renderWithProviders,
    requireRawState,
    screen,
    waitFor,
    waitForPendingMutations,
    within,
} from '@/tests/unit.helpers'
import { previousKeyPair, seedEncryptedArtifact } from '@/tests/artifact.helpers'
import { notFound, useParams } from 'next/navigation'
import { type FC, type ReactElement, useState } from 'react'
import type { StudyJobStatus } from '@/database/types'
import dayjs from 'dayjs'
import { db } from '@/database'
import { lexicalJson } from '@/lib/lexical'
import { researcherSharedOutputsBanner } from '@/lib/study-banners'
import type { RawStudyState, SharedOutputsScreenId } from '@/lib/study-screen'
import { getStudyAction } from '@/server/actions/study.actions'
import { setupStudyAction } from '@/tests/db-action.helpers'
import { SharedOutputsScreen } from './shared-outputs-screen'
import { screenNavProps } from './render-screen'
import type { ScreenComponentProps } from './types'

const APPROVED_AT = new Date('2026-06-20T12:00:00Z')
const SUBMITTED_AT = new Date('2026-07-01T12:00:00Z')
const RUN_AT = new Date('2026-07-02T12:00:00Z')
const DECIDED_AT = new Date('2026-08-05T12:00:00Z')
const VIEWED_AT = new Date('2026-09-10T12:00:00Z')
const EARLIER_RUN_AT = new Date('2026-04-01T12:00:00Z')
const MIDDLE_RUN_AT = new Date('2026-05-01T12:00:00Z')

const SHARE_SENTENCE =
    'Output files are encrypted. Enter your security key to access outputs from this and previous code runs.'
const VIEWED_SENTENCE = 'The outputs are encrypted. Enter your security key to view them again.'
const NO_OUTPUTS_TEXT = 'No output files were shared for this code run.'

const formatDate = (date: Date) => dayjs(date).format('MMM DD, YYYY')

/**
 * One component now serves both share screens, so the wiring below is asserted once per variant
 * rather than in two mirror-image files (PR #1003 review). Each variant carries only what actually
 * differs: the run status that routes to it, its feedback text, and the adjacent outcomes that must
 * NOT reach it. Copy itself is pinned in study-banners.test.ts.
 */
type Variant = {
    screen: SharedOutputsScreenId
    label: string
    /** The run status that, with FILES-APPROVED, routes to this screen. */
    runStatus: StudyJobStatus
    feedbackBody: string
    /** Adjacent outcomes that must fall through to the not-found guard. */
    guardedAgainst: [string, StudyJobStatus[]][]
    /** The post-decryption nav the rule table gives this screen. */
    nav: { editCodeVariant: 'outline' | 'filled'; backToMyStudies: boolean }
    /** Decrypting marks the outputs reviewed, except on an errored run (OTTER-999). */
    reviewedOnDecrypt: boolean
    /** The key sentence once the researcher has viewed the outputs: an errored run stays "code errored". */
    keySentenceOnceViewed: string
}

const VARIANTS: Variant[] = [
    {
        screen: 'outputs-shared',
        label: 'clean run, outputs shared (OTTER-688)',
        runStatus: 'RUN-COMPLETE',
        feedbackBody: 'Reviewed and approved. The results meet the study criteria.',
        guardedAgainst: [
            ['a completed run still awaiting the reviewer files decision', ['RUN-COMPLETE']],
            ['an errored run whose outputs were shared, which has its own screen', ['JOB-ERRORED', 'FILES-APPROVED']],
            ['a clean run decided feedback-only', ['RUN-COMPLETE', 'FILES-REJECTED']],
            // Both FILES-* rows on one job: isOutputsSharedOutcome excludes resultsRejected so the
            // conservative feedback-only screen keeps it, agreeing with the pill, which reads Rejected.
            ['a job carrying both files decisions', ['RUN-COMPLETE', 'FILES-APPROVED', 'FILES-REJECTED']],
        ],
        nav: { editCodeVariant: 'outline', backToMyStudies: true },
        reviewedOnDecrypt: true,
        keySentenceOnceViewed: VIEWED_SENTENCE,
    },
    {
        screen: 'outputs-errored-shared',
        label: 'errored run, outputs shared (OTTER-696)',
        runStatus: 'JOB-ERRORED',
        feedbackBody: 'The run failed on the join; the logs are in the outputs.',
        guardedAgainst: [
            ['an errored run still awaiting the reviewer files decision', ['JOB-ERRORED']],
            ['a clean approved run, which has its own outputs-shared screen', ['RUN-COMPLETE', 'FILES-APPROVED']],
            ['an errored run decided feedback-only', ['JOB-ERRORED', 'FILES-REJECTED']],
        ],
        // The errored share is not a conclusion: Edit code is the forward action, so no exit is offered.
        nav: { editCodeVariant: 'filled', backToMyStudies: false },
        reviewedOnDecrypt: false,
        keySentenceOnceViewed: SHARE_SENTENCE,
    },
]

const copyFor = (screen: SharedOutputsScreenId, dataPartner: string) =>
    researcherSharedOutputsBanner(screen, { dataPartner })

const siblingOf = (variant: Variant) => VARIANTS.find((v) => v.screen !== variant.screen)!

const screenElement = async (
    variant: Variant,
    study: ScreenComponentProps['study'],
    raw: RawStudyState,
    orgSlug: string,
) =>
    SharedOutputsScreen({
        descriptor: { screen: variant.screen },
        study,
        raw,
        ...screenNavProps('researcher', variant.screen, raw, {
            orgSlug,
            studyId: study.id,
        }),
    })

const renderScreen = async (
    variant: Variant,
    study: ScreenComponentProps['study'],
    raw: RawStudyState,
    orgSlug: string,
) => renderWithProviders(await screenElement(variant, study, raw, orgSlug))

const card = () => screen.getByTestId('code-run-card')

const isBefore = (first: Element, second: Element) =>
    !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

// Scoped to its own render: a timed-out test keeps running and must not drive the next test's screen.
const decrypt = async (root: HTMLElement, privateKey?: string) => {
    const view = within(root)
    await view.findByRole('button', { name: 'View files' })
    // By name: the feedback section on this screen contributes a second textbox.
    fireEvent.change(view.getByRole('textbox', { name: 'Security key' }), {
        target: { value: privateKey ?? (await readTestSupportFile('private_key.pem')) },
    })
    fireEvent.click(view.getByRole('button', { name: 'View files' }))
    await waitFor(() =>
        expect(within(view.getByTestId('code-run-card')).getByTestId('code-run-outputs')).toBeInTheDocument(),
    )
    // Decrypting records the outputs reviewed, a write that has to land before the test ends.
    await waitForPendingMutations()
}

const reviewedRows = (jobId: string) =>
    db
        .selectFrom('jobStatusChange')
        .select('status')
        .where('studyJobId', '=', jobId)
        .where('status', '=', 'RESULTS-VIEWED')
        .execute()

type Session = Awaited<ReturnType<typeof mockSessionWithTestData>>

type SetupOptions = {
    withNote?: boolean
    feedbackBody?: string
    files?: { name: string; content: string }[]
    /** Earlier, already-decided runs; written before the latest one, as the fixture requires. */
    priorRuns?: (authorId: string) => PriorCodeRunOptions[]
    /** Reuses a signed-in researcher, for a second study the same person opens. */
    session?: Pick<Session, 'org' | 'user'>
    /** Wraps the latest run for this key instead of the one on file, as for a run shared before a key reset. */
    latestWrapFor?: { publicKey: ArrayBuffer; fingerprint: string }
}

// The run status plus FILES-APPROVED and a RESULTS decision comment — the state that routes here.
const setupShared = async (
    variant: Variant,
    {
        withNote = false,
        feedbackBody = variant.feedbackBody,
        files = [{ name: 'summary.csv', content: 'a,b\n1,2' }],
        priorRuns,
        session,
        latestWrapFor,
    }: SetupOptions = {},
) => {
    const { org, user } = session ?? (await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' }))
    const {
        study: dbStudy,
        job,
        priorJobs,
    } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        jobStatus: 'INITIATED',
        priorRuns: priorRuns?.(user.id),
    })

    // Pin timestamps so the banner date and entry order are deterministic.
    await insertTestJobStatus(job.id, 'CODE-SUBMITTED', { at: SUBMITTED_AT, userId: user.id })
    await insertTestJobStatus(job.id, 'CODE-APPROVED', { at: APPROVED_AT, userId: user.id })
    await insertTestJobStatus(job.id, variant.runStatus, { at: RUN_AT })
    await insertTestJobStatus(job.id, 'FILES-APPROVED', { at: DECIDED_AT, userId: user.id })
    await db
        .insertInto('studyReviewComment')
        .values({
            studyId: dbStudy.id,
            studyJobId: job.id,
            authorId: user.id,
            reviewKind: 'RESULTS',
            entryType: 'DECISION',
            decision: 'APPROVE',
            body: JSON.parse(lexicalJson(feedbackBody)),
            round: 1,
            createdAt: DECIDED_AT,
        })
        .execute()
    if (withNote) {
        await insertTestCodeResubmissionNote({
            studyId: dbStudy.id,
            studyJobId: job.id,
            authorId: user.id,
            round: 1,
            text: 'Adjusted the aggregation query.',
        })
    }

    await seedEncryptedArtifact(job.id, {
        fileType: 'ENCRYPTED-RESULT',
        files,
        sharedWith: user.id,
        wrapFor: latestWrapFor,
    })

    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    const raw = await requireRawState(dbStudy.id)
    ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
    return { org, user, study, raw, job, priorJobs }
}

// The registry types its map as Record<ScreenId, ScreenComponent>, so nothing stops a future id
// being pointed at this component. It must 404 rather than read `undefined.matches` (PR #1003
// review) — the failure the earlier `as ShareScreenId` cast would have allowed through.
describe('SharedOutputsScreen — unmapped screen id', () => {
    it('404s instead of throwing when routed a screen id with no config', async () => {
        const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
        const { study: dbStudy } = await insertTestStudyJobData({
            org,
            researcherId: user.id,
            jobStatus: 'CODE-SUBMITTED',
        })
        const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        const raw = await requireRawState(dbStudy.id)

        await SharedOutputsScreen({
            // Deliberately not a share screen: only the registry decides what reaches this component.
            descriptor: { screen: 'study-overview' },
            study,
            raw,
            ...screenNavProps('researcher', 'study-overview', raw, {
                orgSlug: org.slug,
                studyId: study.id,
            }),
        })

        expect(notFound).toHaveBeenCalled()
    })
})

describe.each(VARIANTS)('SharedOutputsScreen — $label', (variant) => {
    // The two-phase behaviour — live-region identity, key form removal, outputs table — is the
    // panel's contract. This file owns the wiring: this study's copy, partner, decision date,
    // routing predicate, and which unlocked banner each screen actually hands the panel.
    it('wires the page header without repeating its title in the section header', async () => {
        const { org, study, raw } = await setupShared(variant)
        await renderScreen(variant, study, raw, org.slug)

        expect(
            screen.getByRole('heading', { level: 1, name: `${study.title} — Step 4: Verify outputs` }),
        ).toBeInTheDocument()
        const header = screen.getByTestId('proposal-section-header')
        expect(header).toHaveTextContent('Step 4')
        expect(header).toHaveTextContent('Verify outputs')
        expect(header).not.toHaveTextContent(study.title!)
    })

    it('renders the pre-decryption action banner with this screen’s copy and the partner name', async () => {
        const { org, study, raw } = await setupShared(variant)
        await renderScreen(variant, study, raw, org.slug)

        const { locked } = copyFor(variant.screen, org.name)
        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveAttribute('data-variant', locked.variant)
        expect(alert).toHaveTextContent(locked.title)
        expect(alert).toHaveTextContent(locked.body as string)
    })

    it('marks the outputs reviewed only once they are decrypted, never for an errored run', async () => {
        const { org, study, raw, job } = await setupShared(variant)
        const { container } = await renderScreen(variant, study, raw, org.slug)
        await waitForPendingMutations()
        expect(await reviewedRows(job.id)).toHaveLength(0)

        await decrypt(container)

        expect(await reviewedRows(job.id)).toHaveLength(variant.reviewedOnDecrypt ? 1 : 0)
    })

    it('does not render the sibling screen’s banner title', async () => {
        const { org, study, raw } = await setupShared(variant)
        await renderScreen(variant, study, raw, org.slug)

        const sibling = copyFor(siblingOf(variant).screen, org.name)
        const alert = screen.getByTestId('status-alert')
        // A prefix check, because the errored locked title ends with the clean one.
        expect(alert.textContent?.startsWith(sibling.locked.title)).toBe(false)
        expect(alert).not.toHaveTextContent(sibling.unlocked.title)
    })

    it('renders the post-decryption banner with this screen’s copy and variant', async () => {
        const { org, study, raw } = await setupShared(variant)
        const { container } = await renderScreen(variant, study, raw, org.slug)
        await decrypt(container)

        const dataPartner = org.name
        const { locked, unlocked } = copyFor(variant.screen, dataPartner)
        const sibling = copyFor(siblingOf(variant).screen, dataPartner)
        const alert = screen.getByTestId('status-alert')
        expect(alert).toHaveAttribute('data-variant', unlocked.variant)
        expect(alert).toHaveTextContent(unlocked.title)
        expect(alert).toHaveTextContent(unlocked.body as string)
        expect(alert).toHaveTextContent(dayjs(DECIDED_AT).format('MMM DD, YYYY'))
        expect(alert).not.toHaveTextContent(locked.title)
        expect(alert).not.toHaveTextContent(sibling.unlocked.title)
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
        expect(alert).toHaveTextContent(copyFor(variant.screen, org.name).locked.title)
        expect(alert).not.toHaveTextContent('•')
    })

    it('titles the code run card with the decision date, which a later view does not move', async () => {
        const { org, study, raw, job } = await setupShared(variant)
        const { unmount } = await renderScreen(variant, study, raw, org.slug)

        const title = `Code run ${formatDate(DECIDED_AT)}`
        expect(within(card()).getByRole('heading', { name: title })).toBeInTheDocument()
        expect(within(card()).queryByRole('heading', { name: `Code run ${formatDate(RUN_AT)}` })).toBeNull()
        unmount()

        await insertTestJobStatus(job.id, 'RESULTS-VIEWED', { at: VIEWED_AT })
        await renderScreen(variant, study, await requireRawState(study.id), org.slug)

        expect(within(card()).getByRole('heading', { name: title })).toBeInTheDocument()
    })

    it('changes the key sentence only when the status turns to outputs reviewed', async () => {
        const { org, study, raw, job } = await setupShared(variant)
        const { unmount } = await renderScreen(variant, study, raw, org.slug)

        expect(await screen.findByText(SHARE_SENTENCE)).toBeInTheDocument()
        expect(screen.queryByText(VIEWED_SENTENCE)).toBeNull()
        unmount()

        await insertTestJobStatus(job.id, 'RESULTS-VIEWED', { at: VIEWED_AT })
        await renderScreen(variant, study, await requireRawState(study.id), org.slug)

        const other = variant.keySentenceOnceViewed === SHARE_SENTENCE ? VIEWED_SENTENCE : SHARE_SENTENCE
        expect(await screen.findByText(variant.keySentenceOnceViewed)).toBeInTheDocument()
        expect(screen.queryByText(other)).toBeNull()
    })

    it('shows the required key field and View files instead of the sign-up copy', async () => {
        const { org, study, raw } = await setupShared(variant)
        await renderScreen(variant, study, raw, org.slug)

        const keyArea = within(card()).getByTestId('security-key-form')
        expect(await within(keyArea).findByRole('button', { name: 'View files' })).toBeInTheDocument()
        expect(within(keyArea).getByText('Output files')).toBeInTheDocument()
        expect(within(keyArea).getByText(/^Security key/)).toContainElement(within(keyArea).getByLabelText('required'))
        expect(within(keyArea).getByText('Lost your key?')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'View' })).toBeNull()
        expect(screen.queryByText(/issued to you during sign-up/)).toBeNull()
        expect(screen.queryByText(NO_OUTPUTS_TEXT)).toBeNull()
    })

    // OTTER-766: the note belongs to the code step, so it stays on the code screens.
    it("shows the latest run's reviewer feedback inside the card, below the key area", async () => {
        const { org, user, study, raw } = await setupShared(variant, { withNote: true })
        await renderScreen(variant, study, raw, org.slug)

        expect(screen.queryByText(/feedback and notes/i)).toBeNull()
        expect(screen.queryByTestId('feedback-and-notes-section')).toBeNull()
        const feedback = within(card()).getByTestId('latest-run-feedback')
        expect(isBefore(within(card()).getByTestId('security-key-form'), feedback)).toBe(true)
        expect(feedback).toHaveTextContent('Reviewer feedback')
        expect(feedback).not.toHaveTextContent('(v')
        expect(feedback).toHaveTextContent(variant.feedbackBody)
        expect(feedback).toHaveTextContent(user.fullName)
        expect(feedback).toHaveTextContent(formatDate(DECIDED_AT))
        expect(feedback).not.toHaveTextContent('Resubmission note')
        expect(feedback).not.toHaveTextContent('Adjusted the aggregation query.')
        expect(screen.queryAllByTestId('entry-divider')).toHaveLength(0)
    })

    it('swaps the key area for the outputs table inside the card and keeps the feedback below it', async () => {
        const { org, study, raw } = await setupShared(variant)
        const { container } = await renderScreen(variant, study, raw, org.slug)
        await decrypt(container)

        expect(screen.queryByRole('textbox', { name: 'Security key' })).toBeNull()
        const outputs = within(card()).getByTestId('code-run-outputs')
        expect(within(outputs).getByRole('button', { name: 'summary.csv' })).toBeInTheDocument()
        const feedback = within(card()).getByTestId('latest-run-feedback')
        expect(isBefore(outputs, feedback)).toBe(true)
        expect(feedback).toHaveTextContent(variant.feedbackBody)
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

        expect(await within(card()).findByTestId('security-key-form')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /previous step/i })).toHaveAttribute(
            'href',
            `/${org.slug}/study/${study.id}/view/code`,
        )
    })

    it("resolves this screen's post-decryption nav from the step-nav table", async () => {
        const { org, study, raw } = await setupShared(variant)
        const { container } = await renderScreen(variant, study, raw, org.slug)
        await decrypt(container)

        expect(screen.getByTestId('step-navigation')).toBeInTheDocument()
        expect(screen.getByTestId('cta-previous-step')).toHaveAttribute('data-variant', 'subtle')
        const edit = screen.getByTestId('cta-edit-code')
        expect(edit).toHaveAttribute('href', `/${org.slug}/study/${study.id}/resubmit`)
        expect(edit).toHaveAttribute('data-variant', variant.nav.editCodeVariant)
        if (variant.nav.backToMyStudies) {
            expect(screen.getByTestId('cta-back-to-my-studies')).toHaveAttribute('data-variant', 'filled')
        } else {
            expect(screen.queryByTestId('cta-back-to-my-studies')).not.toBeInTheDocument()
        }
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
        await insertTestJobStatuses(job.id, [variant.runStatus, 'FILES-APPROVED'])
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
        await insertTestJobStatuses(job.id, statuses)
        const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        const raw = await requireRawState(dbStudy.id)
        ;(useParams as Mock).mockReturnValue({ orgSlug: org.slug, studyId: study.id })
        await renderScreen(variant, study, raw, org.slug)

        expect(screen.getByText('Outputs not found')).toBeInTheDocument()
        expect(screen.queryByTestId('status-alert')).not.toBeInTheDocument()
    })
})

// OTTER-883: the card holds the latest run alone; earlier runs belong to the code run history.
describe('SharedOutputsScreen with earlier runs', () => {
    const variant = VARIANTS[0]

    it("lists only the latest run's files after decrypting, even a same-named one", async () => {
        const { org, user, study, raw, priorJobs } = await setupShared(variant, {
            files: [
                { name: 'latest.csv', content: 'latest' },
                { name: 'results.csv', content: 'latest' },
            ],
            priorRuns: () => [{ ranAt: EARLIER_RUN_AT }],
        })
        await seedEncryptedArtifact(priorJobs[0].id, {
            fileType: 'ENCRYPTED-RESULT',
            files: [
                { name: 'earlier.csv', content: 'earlier' },
                { name: 'results.csv', content: 'earlier' },
            ],
            sharedWith: user.id,
        })

        const { container } = await renderScreen(variant, study, raw, org.slug)
        await decrypt(container)

        expect(within(card()).getByRole('button', { name: 'latest.csv' })).toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: 'results.csv' })).toHaveLength(1)
        expect(screen.queryByRole('button', { name: 'earlier.csv' })).toBeNull()
    })

    it("shows only the latest run's feedback and follows its decision, not an earlier feedback-only one", async () => {
        const { org, study, raw } = await setupShared(variant, {
            priorRuns: (authorId) => [
                {
                    ranAt: EARLIER_RUN_AT,
                    decision: 'FILES-REJECTED',
                    feedback: { authorId, text: 'Feedback on the first run.' },
                },
                { ranAt: MIDDLE_RUN_AT, feedback: { authorId, text: 'Feedback on the second run.' } },
            ],
        })
        await renderScreen(variant, study, raw, org.slug)

        const feedback = within(card()).getByTestId('latest-run-feedback')
        expect(feedback).toHaveTextContent(variant.feedbackBody)
        expect(screen.queryByText('Feedback on the first run.')).toBeNull()
        expect(screen.queryByText('Feedback on the second run.')).toBeNull()
        expect(await within(card()).findByRole('textbox', { name: 'Security key' })).toBeInTheDocument()
        expect(screen.queryByText(NO_OUTPUTS_TEXT)).toBeNull()
    })
})

const history = () => screen.getByTestId('code-run-history')
const historyRows = () => within(history()).getAllByTestId('code-run-history-row')
const openHistory = async () => {
    fireEvent.click(within(history()).getByRole('button', { name: 'View code run history' }))
    await waitFor(() => expect(historyRows()[0]).toBeVisible())
}
const expandHistoryRow = async (row: HTMLElement) => {
    fireEvent.click(within(row).getByRole('button', { name: /^Code run / }))
    await waitFor(() => expect(within(row).getByTestId('code-run-history-row-body')).toBeVisible())
}

// OTTER-1070: earlier runs open below the latest run's card, through the same history the data
// partner uses.
describe('SharedOutputsScreen code run history', () => {
    // The card names three researcher statuses; both share screens carry the first two.
    const STATUS_CASES = [
        ['code errored', VARIANTS[1], false],
        ['outputs need review', VARIANTS[0], false],
        ['outputs reviewed', VARIANTS[0], true],
    ] as const

    it.each(STATUS_CASES)('lists the earlier runs below the card for %s', async (_status, variant, viewed) => {
        const { org, study, raw, job } = await setupShared(variant, {
            priorRuns: () => [{ ranAt: EARLIER_RUN_AT, codeFiles: ['earlier.R'] }],
        })
        if (viewed) await insertTestJobStatus(job.id, 'RESULTS-VIEWED', { at: VIEWED_AT })
        await renderScreen(variant, study, viewed ? await requireRawState(study.id) : raw, org.slug)

        expect(within(history()).getByRole('heading', { name: 'Code run history (1)' })).toBeInTheDocument()
        expect(isBefore(card(), history())).toBe(true)
        expect(isBefore(history(), screen.getByTestId('step-navigation'))).toBe(true)
        await openHistory()
        await expandHistoryRow(historyRows()[0])
        expect(within(historyRows()[0]).getByText('Code files v1')).toBeVisible()
        expect(within(historyRows()[0]).getByText('earlier.R')).toBeVisible()
    })

    it('is absent when the latest run is the only one', async () => {
        const { org, study, raw } = await setupShared(VARIANTS[0])
        await renderScreen(VARIANTS[0], study, raw, org.slug)

        expect(screen.queryByTestId('code-run-history')).toBeNull()
    })

    it('dates an earlier run by the decision on it, as the card above is dated', async () => {
        const { org, study, raw } = await setupShared(VARIANTS[0], {
            priorRuns: () => [{ ranAt: EARLIER_RUN_AT, decidedAt: MIDDLE_RUN_AT }],
        })
        await renderScreen(VARIANTS[0], study, raw, org.slug)
        await openHistory()

        expect(
            within(history()).getByRole('button', { name: `Code run ${formatDate(MIDDLE_RUN_AT)}` }),
        ).toBeInTheDocument()
        expect(within(card()).getByRole('heading', { name: `Code run ${formatDate(DECIDED_AT)}` })).toBeVisible()
    })

    it('leaves out an earlier run that was never decided', async () => {
        const { org, study, raw } = await setupShared(VARIANTS[0], {
            priorRuns: (authorId) => [
                {
                    ranAt: EARLIER_RUN_AT,
                    decision: null,
                    feedback: { authorId, text: 'Feedback on the undecided run.' },
                },
                { ranAt: MIDDLE_RUN_AT },
            ],
        })
        await renderScreen(VARIANTS[0], study, raw, org.slug)
        await openHistory()

        expect(within(history()).getByRole('heading', { name: 'Code run history (1)' })).toBeInTheDocument()
        expect(historyRows()).toHaveLength(1)
        await expandHistoryRow(historyRows()[0])
        expect(screen.queryByText('Feedback on the undecided run.')).toBeNull()
    })

    it('stays open below the card through decryption, and the latest key opens the runs it fits', async () => {
        const { org, user, study, raw, priorJobs } = await setupShared(VARIANTS[0], {
            files: [
                { name: 'latest.csv', content: 'latest' },
                { name: 'latest-2.csv', content: 'latest' },
            ],
            priorRuns: () => [{ ranAt: MIDDLE_RUN_AT }, { ranAt: EARLIER_RUN_AT }],
        })
        const oldKey = await previousKeyPair()
        await seedEncryptedArtifact(priorJobs[0].id, {
            fileType: 'ENCRYPTED-RESULT',
            files: [
                { name: 'middle.csv', content: 'middle' },
                { name: 'middle-2.csv', content: 'middle' },
            ],
            sharedWith: user.id,
        })
        await seedEncryptedArtifact(priorJobs[1].id, {
            fileType: 'ENCRYPTED-RESULT',
            files: [{ name: 'earlier.csv', content: 'earlier' }],
            sharedWith: user.id,
            wrapFor: { publicKey: oldKey.exportedPublicKey, fingerprint: oldKey.fingerprint },
        })
        const { container } = await renderScreen(VARIANTS[0], study, raw, org.slug)
        const before = history()
        await openHistory()
        const [middle, earlier] = historyRows()
        await expandHistoryRow(middle)
        await expandHistoryRow(earlier)
        expect(within(middle).getByText('Enter security key above to decrypt and review output files.')).toBeVisible()

        await decrypt(container)

        expect(history()).toBe(before)
        expect(within(history()).getByRole('button', { name: 'Hide code run history' })).toBeInTheDocument()
        expect(isBefore(card(), history())).toBe(true)
        expect(await within(middle).findByRole('button', { name: 'middle.csv' })).toBeInTheDocument()
        expect(within(card()).getByTestId('outputs-download-all')).toHaveAttribute('data-variant', 'subtle')
        expect(within(middle).getByTestId('outputs-download-all')).toHaveAttribute('data-variant', 'subtle')
        expect(
            await within(earlier).findByText(
                'This run’s outputs were encrypted with your previous security key. Enter that key to view them.',
            ),
        ).toBeVisible()

        fireEvent.change(within(earlier).getByRole('textbox', { name: /^Security key for Code run/ }), {
            target: { value: oldKey.privateKeyString },
        })
        fireEvent.click(within(earlier).getByRole('button', { name: 'View files' }))
        expect(await within(earlier).findByRole('button', { name: 'earlier.csv' })).toBeInTheDocument()
    })

    it('never asks for a separate history key, because the key above applies', async () => {
        const { org, user, study, raw, priorJobs } = await setupShared(VARIANTS[0], {
            priorRuns: () => [{ ranAt: EARLIER_RUN_AT }],
        })
        await seedEncryptedArtifact(priorJobs[0].id, {
            fileType: 'ENCRYPTED-RESULT',
            files: [{ name: 'earlier.csv', content: 'earlier' }],
            sharedWith: user.id,
        })
        await renderScreen(VARIANTS[0], study, raw, org.slug)
        await openHistory()

        expect(screen.queryByTestId('code-run-history-key')).toBeNull()
    })

    it('opens the latest run with the key it was shared for before a key reset, and earlier runs with it', async () => {
        const oldKey = await previousKeyPair()
        const wrapFor = { publicKey: oldKey.exportedPublicKey, fingerprint: oldKey.fingerprint }
        const { org, user, study, raw, priorJobs } = await setupShared(VARIANTS[0], {
            priorRuns: () => [{ ranAt: EARLIER_RUN_AT }],
            latestWrapFor: wrapFor,
        })
        await seedEncryptedArtifact(priorJobs[0].id, {
            fileType: 'ENCRYPTED-RESULT',
            files: [{ name: 'earlier.csv', content: 'earlier' }],
            sharedWith: user.id,
            wrapFor,
        })
        const { container } = await renderScreen(VARIANTS[0], study, raw, org.slug)
        await openHistory()
        const [earlier] = historyRows()
        await expandHistoryRow(earlier)
        expect(within(earlier).getByText('Enter security key above to decrypt and review output files.')).toBeVisible()

        await decrypt(container, oldKey.privateKeyString)

        expect(await within(earlier).findByRole('button', { name: 'earlier.csv' })).toBeInTheDocument()
        expect(
            within(earlier).queryByText(
                'This run’s outputs were encrypted with your previous security key. Enter that key to view them.',
            ),
        ).toBeNull()
    })
})

// Stands in for client navigation: the second study's page replaces the first in the same tree.
const StudySwitcher: FC<{ first: ReactElement; second: ReactElement }> = ({ first, second }) => {
    const [showSecond, setShowSecond] = useState(false)
    return (
        <>
            <button onClick={() => setShowSecond(true)}>Open the second study</button>
            {showSecond ? second : first}
        </>
    )
}

describe('SharedOutputsScreen across studies', () => {
    const variant = VARIANTS[0]

    it("does not carry one study's decrypted outputs or feedback into another", async () => {
        const first = await setupShared(variant, { files: [{ name: 'first-study.csv', content: 'first' }] })
        const second = await setupShared(variant, {
            session: first,
            feedbackBody: 'Feedback that belongs to the second study.',
            files: [{ name: 'second-study.csv', content: 'second' }],
        })
        ;(useParams as Mock).mockReturnValue({ orgSlug: first.org.slug, studyId: first.study.id })

        const { container } = renderWithProviders(
            <StudySwitcher
                first={await screenElement(variant, first.study, first.raw, first.org.slug)}
                second={await screenElement(variant, second.study, second.raw, second.org.slug)}
            />,
        )
        await decrypt(container)
        expect(within(card()).getByRole('button', { name: 'first-study.csv' })).toBeInTheDocument()
        ;(useParams as Mock).mockReturnValue({ orgSlug: second.org.slug, studyId: second.study.id })
        fireEvent.click(screen.getByRole('button', { name: 'Open the second study' }))

        expect(await within(card()).findByRole('textbox', { name: 'Security key' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'first-study.csv' })).toBeNull()
        expect(within(card()).getByTestId('latest-run-feedback')).toHaveTextContent(
            'Feedback that belongs to the second study.',
        )
        expect(screen.queryByText(variant.feedbackBody)).toBeNull()
    })

    it("does not carry one study's code run history state into another", async () => {
        const first = await setupShared(variant, {
            priorRuns: (authorId) => [{ ranAt: EARLIER_RUN_AT, feedback: { authorId, text: 'First study run.' } }],
        })
        const second = await setupShared(variant, {
            session: first,
            priorRuns: (authorId) => [
                { ranAt: EARLIER_RUN_AT, feedback: { authorId, text: 'Second study run.' } },
                { ranAt: MIDDLE_RUN_AT },
            ],
        })
        ;(useParams as Mock).mockReturnValue({ orgSlug: first.org.slug, studyId: first.study.id })
        renderWithProviders(
            <StudySwitcher
                first={await screenElement(variant, first.study, first.raw, first.org.slug)}
                second={await screenElement(variant, second.study, second.raw, second.org.slug)}
            />,
        )
        await openHistory()
        await expandHistoryRow(historyRows()[0])
        expect(within(historyRows()[0]).getByText('First study run.')).toBeVisible()
        ;(useParams as Mock).mockReturnValue({ orgSlug: second.org.slug, studyId: second.study.id })
        fireEvent.click(screen.getByRole('button', { name: 'Open the second study' }))

        expect(within(history()).getByRole('heading', { name: 'Code run history (2)' })).toBeInTheDocument()
        expect(within(history()).getByRole('button', { name: 'View code run history' })).toBeInTheDocument()
        expect(screen.queryByText('First study run.')).toBeNull()
        await openHistory()
        for (const row of historyRows()) {
            expect(within(row).getByRole('button', { name: /^Code run / })).toHaveAttribute('aria-expanded', 'false')
        }
    })
})
