import { useEffect, useRef } from 'react'
import type { Route } from 'next'
import { beforeEach, describe, expect, it } from 'vitest'
import {
    fireEvent,
    insertTestStudyJobData,
    mockSessionWithTestData,
    readTestSupportFile,
    renderWithProviders,
    screen,
    waitFor,
    waitForPendingMutations,
    within,
} from '@/tests/unit.helpers'
import { seedEncryptedArtifact } from '@/tests/artifact.helpers'
import { STATUS_ALERT_VARIANT } from '@/components/study/status-alert'
import type { PhasedBannerCopy } from '@/lib/study-banners'
import type { PhasedStepNav } from '@/lib/study-screen'
import { type Org } from '@/schema/org'
import { latestJobForStudy } from '@/server/db/queries'
import { SharedOutputsPanel } from './shared-outputs-panel'

const DECIDED_AT = new Date('2026-08-05T12:00:00Z')
const DATA_PARTNER = 'Memorial Hospital'
const KEY_DESCRIPTION =
    'Output files are encrypted. Enter your security key to access outputs from this and previous code runs.'

const LOCKED_HEADING = 'Code run errored. Decrypt to view your outputs and feedback'
const UNLOCKED_HEADING = 'Resolve the code error to proceed'
const LOCKED_BODY = `${DATA_PARTNER} has shared the outputs and feedback for the latest code run. Enter your security key to view them and diagnose the issue.`
const UNLOCKED_BODY =
    'Review the outputs and feedback for the latest code run below to understand why it failed, then update your code and resubmit.'

const LOCKED_TITLE = `${LOCKED_HEADING} • Aug 05, 2026`
const UNLOCKED_TITLE = `${UNLOCKED_HEADING} • Aug 05, 2026`

const BANNER: PhasedBannerCopy = {
    locked: { variant: STATUS_ALERT_VARIANT.action, title: LOCKED_HEADING, body: LOCKED_BODY },
    unlocked: { variant: STATUS_ALERT_VARIANT.action, title: UNLOCKED_HEADING, body: UNLOCKED_BODY },
}

const PREVIOUS_HREF = '/test-lab/study/abc/view/code' as Route
const EDIT_CODE_HREF = '/test-lab/study/abc/resubmit' as Route
const DASHBOARD_HREF = '/dashboard' as Route

// The terminal-positive shape (spec state 5); the errored share passes Edit code solid instead.
const PREVIOUS = {
    label: 'Previous step',
    href: PREVIOUS_HREF,
    variant: 'subtle',
    testId: 'cta-previous-step',
} as const
const NAV: PhasedStepNav = {
    locked: { back: PREVIOUS },
    unlocked: {
        back: PREVIOUS,
        secondary: { label: 'Edit code', href: EDIT_CODE_HREF, variant: 'outline', testId: 'cta-edit-code' },
        forward: {
            label: 'Back to my studies',
            href: DASHBOARD_HREF,
            variant: 'solid',
            testId: 'cta-back-to-my-studies',
        },
    },
}

// Counting mounts is the only way to prove the banner swap did not remount it; a remount
// silently resets each entry's expand/collapse state.
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
    // A real row still has to exist for the seeded artifact to hang off.
    let job: { id: string }
    let studyId: string

    const renderPanel = (banner = BANNER) =>
        renderWithProviders(
            <SharedOutputsPanel
                studyId={studyId}
                decidedAt={DECIDED_AT}
                banner={banner}
                job={job}
                keyDescription={KEY_DESCRIPTION}
                feedbackSection={<FeedbackProbe />}
                nav={NAV}
                priorRuns={[]}
            />,
        )

    const card = (root = document.body) => within(root).getByTestId('code-run-card')

    const isBefore = (first: Element, second: Element) =>
        !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

    // Scoped to its own render: a timed-out test keeps running and must not drive the next test's screen.
    const enterKey = async (root: HTMLElement, value: string) => {
        const view = within(root)
        await view.findByRole('button', { name: 'View files' })
        fireEvent.change(view.getByRole('textbox'), { target: { value } })
        fireEvent.click(view.getByRole('button', { name: 'View files' }))
    }

    const decrypt = async (root: HTMLElement) => {
        await enterKey(root, await readTestSupportFile('private_key.pem'))
        await waitFor(() => expect(within(card(root)).getByTestId('code-run-outputs')).toBeInTheDocument())
        // Decrypting fires the reviewed write; let it settle before the test ends.
        await waitForPendingMutations()
    }

    beforeEach(async () => {
        mountCount.current = 0
        const { org, user }: { org: Org; user: { id: string } } = await mockSessionWithTestData({
            orgSlug: 'test-lab',
            orgType: 'lab',
        })
        const { study } = await insertTestStudyJobData({ org, researcherId: user.id, jobStatus: 'CODE-SUBMITTED' })
        job = (await latestJobForStudy(study.id))!
        studyId = study.id

        await seedEncryptedArtifact(job.id, {
            fileType: 'ENCRYPTED-RESULT',
            files: [{ name: 'summary.csv', content: 'a,b\n1,2' }],
            sharedWith: user.id,
        })
    })

    describe('before decryption', () => {
        it('renders the STEP 4 "Verify outputs" section header without a study title', () => {
            renderPanel()
            const header = screen.getByTestId('proposal-section-header')
            expect(header).toHaveTextContent('Step 4')
            expect(header).toHaveTextContent('Verify outputs')
            expect(header).not.toHaveTextContent('Diabetes readmission rates')
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
                    studyId={studyId}
                    decidedAt={null}
                    banner={BANNER}
                    job={job}
                    keyDescription={KEY_DESCRIPTION}
                    feedbackSection={<FeedbackProbe />}
                    nav={NAV}
                    priorRuns={[]}
                />,
            )
            const alert = screen.getByTestId('status-alert')
            expect(alert).toHaveTextContent(LOCKED_HEADING)
            expect(alert).not.toHaveTextContent('•')
        })

        it('renders the key fields in the code run card with the given sentence, then the feedback', async () => {
            renderPanel()
            await screen.findByRole('button', { name: 'View files' })
            expect(within(card()).getByRole('heading', { name: 'Code run Aug 05, 2026' })).toBeInTheDocument()
            const keyFields = within(card()).getByTestId('security-key-form')
            expect(within(keyFields).getByText(/^Security key/)).toContainElement(
                within(keyFields).getByLabelText('required'),
            )
            expect(within(keyFields).getByText(KEY_DESCRIPTION)).toBeInTheDocument()
            expect(screen.queryByText(/issued to you during sign-up/)).toBeNull()
            expect(isBefore(keyFields, within(card()).getByTestId('feedback-probe'))).toBe(true)
        })

        it('keeps the empty-key and invalid-key errors of the shared key fields', async () => {
            const { container } = renderPanel()
            fireEvent.click(await within(container).findByRole('button', { name: 'View files' }))
            expect(await screen.findByText('Enter your security key to decrypt the outputs.')).toBeInTheDocument()

            await enterKey(container, 'not a key')
            expect(
                await screen.findByText('Invalid key. Check that you copied the full key and enter it again.'),
            ).toBeInTheDocument()
            expect(screen.getByTestId('feedback-probe')).toBeInTheDocument()
        })

        // The outputs are encrypted to the enclave, so the researcher's key opens them only through
        // the wraps the researcher key set carries.
        it("asks for the RESEARCHER key set, not the reviewer's", async () => {
            const { container } = renderPanel()
            await decrypt(container)
            expect(screen.getByText('summary.csv')).toBeInTheDocument()
        })

        it('shows the feedback section and no outputs table', () => {
            renderPanel()
            expect(within(card()).getByTestId('feedback-probe')).toBeInTheDocument()
            expect(screen.queryByTestId('code-run-outputs')).not.toBeInTheDocument()
        })

        it('offers only Previous step — Edit code and Back to my studies are absent', () => {
            renderPanel()
            expect(screen.getByTestId('step-navigation')).toBeInTheDocument()
            const previous = screen.getByRole('link', { name: /previous step/i })
            expect(previous).toHaveAttribute('href', PREVIOUS_HREF)
            expect(previous).toHaveAttribute('data-variant', 'subtle')
            expect(screen.queryByRole('link', { name: /edit code/i })).not.toBeInTheDocument()
            expect(screen.queryByRole('link', { name: /back to my studies/i })).not.toBeInTheDocument()
        })
    })

    describe('after decryption', () => {
        it('swaps to the unlocked copy and variant with the same decision date', async () => {
            const { container } = renderPanel()
            await decrypt(container)
            const alert = screen.getByTestId('status-alert')
            expect(alert).toHaveAttribute('data-variant', 'action')
            expect(alert).toHaveTextContent(UNLOCKED_TITLE)
            expect(alert).toHaveTextContent(UNLOCKED_BODY)
            expect(alert).not.toHaveTextContent(LOCKED_HEADING)
        })

        it('renders a success unlocked banner when that is the copy it is given', async () => {
            const { container } = renderPanel({
                ...BANNER,
                unlocked: { ...BANNER.unlocked, variant: STATUS_ALERT_VARIANT.success },
            })
            await decrypt(container)
            const alert = screen.getByTestId('status-alert')
            expect(alert).toHaveAttribute('data-variant', 'success')
            expect(alert).toHaveTextContent(UNLOCKED_TITLE)
            expect(alert).toHaveTextContent(UNLOCKED_BODY)
        })

        it('announces the swap in the SAME polite live region rather than remounting it', async () => {
            const { container } = renderPanel()
            const before = screen.getByTestId('status-alert')
            expect(before).toHaveAttribute('aria-live', 'polite')
            await decrypt(container)
            const after = screen.getByTestId('status-alert')
            // Same DOM node: swapping two banner components would drop the announcement.
            expect(after).toBe(before)
            expect(after).toHaveAttribute('aria-live', 'polite')
            expect(after).toHaveAttribute('aria-atomic', 'true')
            expect(after).not.toHaveAttribute('aria-live', 'assertive')
        })

        it('keeps the feedback section mounted and below the outputs across the swap', async () => {
            const { container } = renderPanel()
            expect(mountCount.current).toBe(1)
            await enterKey(container, await readTestSupportFile('private_key.pem'))
            expect(screen.getByTestId('feedback-probe')).toBeInTheDocument()
            await waitFor(() => expect(within(card(container)).getByTestId('code-run-outputs')).toBeInTheDocument())
            await waitForPendingMutations()

            const probe = within(card()).getByTestId('feedback-probe')
            expect(isBefore(within(card()).getByTestId('code-run-outputs'), probe)).toBe(true)
            expect(mountCount.current).toBe(1)
        })

        it('moves focus to the Output files title that replaces the key fields', async () => {
            const { container } = renderPanel()
            await decrypt(container)
            await waitFor(() => expect(within(card()).getByText('Output files')).toHaveFocus())
        })

        it('removes the security key form entirely, leaving no input or button behind', async () => {
            const { container } = renderPanel()
            await decrypt(container)
            expect(screen.queryByTestId('security-key-form')).not.toBeInTheDocument()
            expect(screen.queryByText(/^Security key/)).not.toBeInTheDocument()
            expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
            expect(screen.queryByRole('button', { name: 'View files' })).not.toBeInTheDocument()
        })

        it('renders the reused outputs table with its header and all three columns', async () => {
            const { container } = renderPanel()
            await decrypt(container)
            expect(within(card()).getByTestId('code-run-outputs')).toHaveTextContent('Output files')
            const table = screen.getByTestId('outputs-files-table')
            expect(table).toHaveTextContent('File name')
            expect(table).toHaveTextContent('Last activity')
            expect(table).toHaveTextContent('Actions')
            expect(screen.getByText('summary.csv')).toBeInTheDocument()
        })

        it('renders the given nav in full once decrypted, keeping Previous step', async () => {
            const { container } = renderPanel()
            await decrypt(container)

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
