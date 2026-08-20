import { useEffect, useRef } from 'react'
import type { Route } from 'next'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    fireEvent,
    insertTestStudyJobData,
    mockSessionWithTestData,
    readTestSupportFile,
    renderWithProviders,
    screen,
    waitFor,
} from '@/tests/unit.helpers'
import { seedEncryptedArtifact } from '@/tests/artifact.helpers'
import { type Org } from '@/schema/org'
import { latestJobForStudy } from '@/server/db/queries'
import { SharedOutputsPanel } from './shared-outputs-panel'

vi.mock('@/server/actions/study-job.actions', () => ({
    fetchEncryptedJobFilesAction: vi.fn(() => []),
}))

vi.mock('@/server/actions/study-job-file-activity.actions', () => ({
    fetchJobFileActivityAction: vi.fn(() => []),
    recordJobFileActivityAction: vi.fn(() => ({})),
}))

const DECIDED_AT = new Date('2026-08-05T12:00:00Z')
const DATA_PARTNER = 'Memorial Hospital'

// Undated headings go in as props; the panel appends the shared decision date to both phases.
const LOCKED_HEADING = 'Decrypt outputs to view code error'
const UNLOCKED_HEADING = 'Outputs and feedback available'
const LOCKED_BODY = `${DATA_PARTNER} has shared the outputs and feedback. Enter your security key below to decrypt and diagnose the issue.`
const UNLOCKED_BODY =
    "Review the outputs and feedback below. If they don't meet your expectations, you can update your code and resubmit."

const LOCKED_TITLE = `${LOCKED_HEADING} • Aug 05, 2026`
const UNLOCKED_TITLE = `${UNLOCKED_HEADING} • Aug 05, 2026`

const BANNER = {
    locked: { title: LOCKED_HEADING, body: LOCKED_BODY },
    unlocked: { title: UNLOCKED_HEADING, body: UNLOCKED_BODY },
}

const PREVIOUS_HREF = '/test-lab/study/abc/view/code' as Route
const EDIT_CODE_HREF = '/test-lab/study/abc/resubmit' as Route
const DASHBOARD_HREF = '/dashboard' as Route

// Stands in for the server-rendered feedback section. Counting mounts is the only way to prove the
// banner swap did not remount it — a remount silently resets each entry's expand/collapse state.
const mountCount = { current: 0 }
const FeedbackProbe = () => {
    const counted = useRef(false)
    useEffect(() => {
        if (counted.current) return
        counted.current = true
        mountCount.current += 1
    }, [])
    return <div data-testid="feedback-probe">Feedback and notes</div>
}

describe('SharedOutputsPanel', () => {
    // The panel reads only job.id; a real row still has to exist for the seeded artifact to hang off.
    let job: { id: string }

    const renderPanel = () =>
        renderWithProviders(
            <SharedOutputsPanel
                studyTitle="Diabetes readmission rates"
                decidedAt={DECIDED_AT}
                banner={BANNER}
                job={job}
                feedbackSection={<FeedbackProbe />}
                previousHref={PREVIOUS_HREF}
                editCodeHref={EDIT_CODE_HREF}
                dashboardHref={DASHBOARD_HREF}
            />,
        )

    const decrypt = async () => {
        const privateKeyPem = await readTestSupportFile('private_key.pem')
        await screen.findByRole('button', { name: 'View' })
        fireEvent.change(screen.getByRole('textbox'), { target: { value: privateKeyPem } })
        fireEvent.click(screen.getByRole('button', { name: 'View' }))
        await waitFor(() => expect(screen.getByTestId('outputs-files-section')).toBeInTheDocument())
    }

    beforeEach(async () => {
        mountCount.current = 0
        const { org, user }: { org: Org; user: { id: string } } = await mockSessionWithTestData({
            orgSlug: 'test-lab',
            orgType: 'lab',
        })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })
        job = (await latestJobForStudy(study.id))!

        const { fetchEncryptedJobFilesAction } = await import('@/server/actions/study-job.actions')
        const artifact = await seedEncryptedArtifact(job.id, {
            fileType: 'ENCRYPTED-RESULT',
            files: [{ name: 'summary.csv', content: 'a,b\n1,2' }],
        })
        vi.mocked(fetchEncryptedJobFilesAction).mockResolvedValue([artifact])
    })

    describe('before decryption', () => {
        it('renders the STEP 4 "Verify outputs" section header with the study title', () => {
            renderPanel()
            const header = screen.getByTestId('proposal-section-header')
            expect(header).toHaveTextContent('STEP 4')
            expect(header).toHaveTextContent('Verify outputs')
            expect(header).toHaveTextContent('Diabetes readmission rates')
        })

        it('renders the action banner with the exact copy, data partner and decision date', () => {
            renderPanel()
            const alert = screen.getByTestId('status-alert')
            expect(alert).toHaveAttribute('data-variant', 'action')
            expect(alert).toHaveTextContent(LOCKED_TITLE)
            expect(alert).toHaveTextContent(LOCKED_BODY)
        })

        it('degrades to an undated banner when no decision timestamp is available', () => {
            renderWithProviders(
                <SharedOutputsPanel
                    studyTitle="Diabetes readmission rates"
                    decidedAt={null}
                    banner={BANNER}
                    job={job}
                    feedbackSection={<FeedbackProbe />}
                    previousHref={PREVIOUS_HREF}
                    editCodeHref={EDIT_CODE_HREF}
                    dashboardHref={DASHBOARD_HREF}
                />,
            )
            const alert = screen.getByTestId('status-alert')
            expect(alert).toHaveTextContent('Decrypt outputs to view code error')
            expect(alert).not.toHaveTextContent('•')
        })

        it('renders the security key form with the base component copy, uncustomised', async () => {
            renderPanel()
            await screen.findByRole('button', { name: 'View' })
            expect(screen.getByTestId('security-key-form')).toBeInTheDocument()
            expect(screen.getByRole('heading', { name: /^Security key/ })).toBeInTheDocument()
            expect(
                screen.getByText('This key is required to access the outputs. It was issued to you during sign-up.'),
            ).toBeInTheDocument()
        })

        it("asks for the RESEARCHER key set, not the reviewer's", async () => {
            const { fetchEncryptedJobFilesAction } = await import('@/server/actions/study-job.actions')
            renderPanel()
            await screen.findByRole('button', { name: 'View' })
            expect(fetchEncryptedJobFilesAction).toHaveBeenCalledWith({ jobId: job.id, type: 'researcher' })
        })

        it('shows the feedback section and no outputs table', () => {
            renderPanel()
            expect(screen.getByTestId('feedback-probe')).toBeInTheDocument()
            expect(screen.queryByTestId('outputs-files-section')).not.toBeInTheDocument()
        })

        it('offers only Previous step — Edit code and Back to my studies are absent', () => {
            renderPanel()
            const previous = screen.getByRole('link', { name: /previous step/i })
            expect(previous).toHaveAttribute('href', PREVIOUS_HREF)
            expect(previous).toHaveAttribute('data-variant', 'subtle')
            expect(screen.queryByRole('link', { name: /edit code/i })).not.toBeInTheDocument()
            expect(screen.queryByRole('link', { name: /back to my studies/i })).not.toBeInTheDocument()
        })
    })

    describe('after decryption', () => {
        it('swaps the action banner for the success banner with the exact copy and the same date', async () => {
            renderPanel()
            await decrypt()
            const alert = screen.getByTestId('status-alert')
            expect(alert).toHaveAttribute('data-variant', 'success')
            expect(alert).toHaveTextContent(UNLOCKED_TITLE)
            expect(alert).toHaveTextContent(UNLOCKED_BODY)
            expect(alert).not.toHaveTextContent('Decrypt outputs to view code error')
        })

        it('announces the swap in the SAME polite live region rather than remounting it', async () => {
            renderPanel()
            const before = screen.getByTestId('status-alert')
            expect(before).toHaveAttribute('aria-live', 'polite')
            await decrypt()
            const after = screen.getByTestId('status-alert')
            // Same DOM node: a screen reader only announces a content change inside a region that
            // was already mounted, so swapping two banner components would drop the announcement.
            expect(after).toBe(before)
            expect(after).toHaveAttribute('aria-live', 'polite')
            expect(after).toHaveAttribute('aria-atomic', 'true')
            expect(after).not.toHaveAttribute('aria-live', 'assertive')
        })

        it('keeps the feedback section mounted across the swap', async () => {
            renderPanel()
            expect(mountCount.current).toBe(1)
            await decrypt()
            expect(screen.getByTestId('feedback-probe')).toBeInTheDocument()
            expect(mountCount.current).toBe(1)
        })

        it('removes the security key form entirely, leaving no input or button behind', async () => {
            renderPanel()
            await decrypt()
            expect(screen.queryByTestId('security-key-form')).not.toBeInTheDocument()
            expect(screen.queryByRole('heading', { name: /^Security key/ })).not.toBeInTheDocument()
            expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument()
        })

        it('renders the reused outputs table with its header and all three columns', async () => {
            renderPanel()
            await decrypt()
            expect(screen.getByTestId('outputs-files-section')).toHaveTextContent('Output files')
            const table = screen.getByTestId('outputs-files-table')
            expect(table).toHaveTextContent('File name')
            expect(table).toHaveTextContent('Last activity')
            expect(table).toHaveTextContent('Actions')
            expect(screen.getByText('summary.csv')).toBeInTheDocument()
        })

        it('adds Edit code (outline) and Back to my studies (filled), both enabled, keeping Previous step', async () => {
            renderPanel()
            await decrypt()

            const previous = screen.getByRole('link', { name: /previous step/i })
            expect(previous).toHaveAttribute('href', PREVIOUS_HREF)
            expect(previous).toHaveAttribute('data-variant', 'subtle')

            const edit = screen.getByRole('link', { name: /edit code/i })
            expect(edit).toHaveAttribute('href', EDIT_CODE_HREF)
            expect(edit).toHaveAttribute('data-variant', 'outline')
            expect(edit).not.toHaveAttribute('data-disabled')

            const dashboard = screen.getByRole('link', { name: /back to my studies/i })
            expect(dashboard).toHaveAttribute('href', DASHBOARD_HREF)
            expect(dashboard).toHaveAttribute('data-variant', 'filled')
            expect(dashboard).not.toHaveAttribute('data-disabled')
        })
    })
})
