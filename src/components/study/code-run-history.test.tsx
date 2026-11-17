import {
    db,
    describe,
    expect,
    fireEvent,
    hydrateServerHtml,
    type PriorCodeRunOptions,
    insertTestStudyJobData,
    it,
    mockSessionWithTestData,
    readTestSupportFile,
    renderWithProviders,
    screen,
    userEvent,
    vi,
    waitFor,
    within,
} from '@/tests/unit.helpers'
import { previousKeyPair, seedEncryptedArtifact, seedJobFileRow, unrelatedKeyPair } from '@/tests/artifact.helpers'
import { fingerprintKeyData, pemToArrayBuffer } from 'si-encryption/util'
import dayjs from 'dayjs'
import type { StudyJobStatus } from '@/database/types'
import { ARCHIVE_INTEGRITY_MESSAGE } from '@/hooks/use-decrypt-files'
import { lexicalJson } from '@/lib/lexical'
import { studyCodeURL } from '@/lib/paths'
import { latestJobForStudy, priorCodeRunsForStudy } from '@/server/db/queries'
import {
    CodeRunHistory,
    decryptedSummary,
    historyKeySummary,
    keyAttemptOutcome,
    type RunOutputs,
} from './code-run-history'
import { DecryptAndViewOutputs } from './decrypt-and-view-outputs'
import { ResearcherCodeRunHistory } from './researcher-code-run-history'

const run = (
    id: string,
    ranAt: string,
    statuses: StudyJobStatus[] = ['CODE-SUBMITTED', 'RUN-COMPLETE', 'FILES-APPROVED'],
) => ({
    id,
    round: 1,
    ranAt: new Date(ranAt),
    statusChanges: statuses.map((status) => ({ status, createdAt: ranAt })),
    codeFiles: [] as Array<{ id: string; name: string; fileType: 'MAIN-CODE' | 'SUPPLEMENTAL-CODE' }>,
    feedback: [],
})

// Newest first, as priorCodeRunsForStudy returns them.
const runsOf = (count: number) =>
    Array.from({ length: count }, (_, i) => run(`run-${i}`, `2026-0${9 - i}-15T12:00:00Z`))

const RUNS = [
    run('run-3', '2026-03-05T12:00:00Z'),
    run('run-2', '2026-02-10T12:00:00Z'),
    run('run-1', '2026-01-20T12:00:00Z'),
]

// The decrypt tests pass their own render as root: a timed-out test keeps running and must not
// drive the next test's screen.
const viewButton = (root = document.body) =>
    within(root).getByRole('button', { name: /^(View|Hide) code run history$/ })
const rows = (root = document.body) => within(root).getAllByTestId('code-run-history-row')
const firstRow = () => rows()[0]
const rowToggle = (date: string) => screen.getByRole('button', { name: `Code run ${date}` })

const historyStatus = () => within(screen.getByTestId('code-run-history')).getAllByRole('status')[0]

const openHistory = async (root = document.body) => {
    await userEvent.click(viewButton(root))
    await waitFor(() => expect(rows(root)[0]).toBeVisible())
}

describe('CodeRunHistory', () => {
    it('renders nothing when there are no earlier runs', () => {
        renderWithProviders(<CodeRunHistory runs={[]} />)

        expect(screen.queryByTestId('code-run-history')).toBeNull()
    })

    it.each([1, 2, 3, 4])('counts %i earlier runs in the title', (count) => {
        renderWithProviders(<CodeRunHistory runs={runsOf(count)} />)

        expect(screen.getByRole('heading', { name: `Code run history (${count})` })).toBeInTheDocument()
    })

    it('starts collapsed with a View code run history button', () => {
        renderWithProviders(<CodeRunHistory runs={RUNS} />)

        expect(viewButton()).toHaveAccessibleName('View code run history')
        // The label already says which way it toggles; aria-expanded would make it read twice.
        expect(viewButton()).not.toHaveAttribute('aria-expanded')
        expect(firstRow()).not.toBeVisible()
    })

    it('expands in place to list the runs newest first, each collapsed, and Hide collapses it again', async () => {
        renderWithProviders(<CodeRunHistory runs={RUNS} />)

        await openHistory()

        expect(viewButton()).toHaveAccessibleName('Hide code run history')
        expect(viewButton()).not.toHaveAttribute('aria-expanded')
        expect(viewButton()).toHaveAttribute('type', 'button')
        expect(rows().map((row) => within(row).getByRole('button').textContent)).toEqual([
            'Code run • Mar 05, 2026Outputs and feedback',
            'Code run • Feb 10, 2026Outputs and feedback',
            'Code run • Jan 20, 2026Outputs and feedback',
        ])
        for (const date of ['Mar 05, 2026', 'Feb 10, 2026', 'Jan 20, 2026']) {
            expect(rowToggle(date)).toHaveAttribute('aria-expanded', 'false')
        }

        await userEvent.click(viewButton())

        expect(viewButton()).toHaveTextContent('View code run history')
        await waitFor(() => expect(firstRow()).not.toBeVisible())
    })

    it('stays stable across repeated expand and collapse cycles', async () => {
        renderWithProviders(<CodeRunHistory runs={RUNS} />)

        for (let i = 0; i < 3; i++) {
            await userEvent.click(viewButton())
            expect(viewButton()).toHaveTextContent('Hide code run history')
            await userEvent.click(viewButton())
            expect(viewButton()).toHaveTextContent('View code run history')
        }
        expect(rows()).toHaveLength(3)
    })

    it.each([
        { outcome: 'RUN-COMPLETE', decision: 'FILES-APPROVED', badges: ['Outputs and feedback'] },
        { outcome: 'RUN-COMPLETE', decision: 'FILES-REJECTED', badges: ['Feedback only'] },
        { outcome: 'JOB-ERRORED', decision: 'FILES-APPROVED', badges: ['Code errored', 'Outputs and feedback'] },
        { outcome: 'JOB-ERRORED', decision: 'FILES-REJECTED', badges: ['Code errored', 'Feedback only'] },
    ] as const)('labels a $outcome run decided $decision', async ({ outcome, decision, badges }) => {
        renderWithProviders(
            <CodeRunHistory runs={[run('run', '2026-03-05T12:00:00Z', ['CODE-SUBMITTED', outcome, decision])]} />,
        )

        await openHistory()

        const labels = [...firstRow().querySelectorAll('.mantine-Badge-root')].map((badge) => badge.textContent)
        expect(labels).toEqual(badges)
    })

    it('still labels a run errored when a rerun in the same job completed', async () => {
        renderWithProviders(
            <CodeRunHistory
                runs={[run('run', '2026-03-05T12:00:00Z', ['JOB-ERRORED', 'RUN-COMPLETE', 'FILES-APPROVED'])]}
            />,
        )

        await openHistory()

        expect(firstRow()).toHaveTextContent('Code errored')
        expect(firstRow()).toHaveTextContent('Outputs and feedback')
    })

    it('builds each row as a heading around one toggle whose name stays put and whose description is its status', async () => {
        renderWithProviders(
            <CodeRunHistory
                runs={[run('run-3', '2026-03-05T12:00:00Z', ['CODE-SUBMITTED', 'JOB-ERRORED', 'FILES-REJECTED'])]}
            />,
        )
        await openHistory()

        const toggle = rowToggle('Mar 05, 2026')
        expect(within(firstRow()).getByRole('heading', { level: 4 })).toContainElement(toggle)
        expect(toggle).toHaveAccessibleDescription(/Code errored/)
        expect(toggle).toHaveAccessibleDescription(/Feedback only/)
        expect(toggle).toHaveAttribute('aria-expanded', 'false')

        await userEvent.click(toggle)

        expect(rowToggle('Mar 05, 2026')).toBe(toggle)
        expect(toggle).toHaveAttribute('aria-expanded', 'true')
        const panel = document.getElementById(toggle.getAttribute('aria-controls')!)
        expect(panel).toContainElement(within(firstRow()).getByTestId('code-run-history-row-body'))
        expect(firstRow().querySelector('[role="region"]')).toBeNull()
    })

    it('toggles a row from anywhere on its header, not just the caret', async () => {
        renderWithProviders(<CodeRunHistory runs={RUNS} />)
        await openHistory()

        await userEvent.click(within(firstRow()).getByText('Outputs and feedback'))

        expect(rowToggle('Mar 05, 2026')).toHaveAttribute('aria-expanded', 'true')
    })

    it('keeps collapsed rows and the collapsed section out of the accessibility tree', async () => {
        renderWithProviders(<CodeRunHistory runs={runsOf(5)} />)

        expect(screen.queryAllByRole('button', { name: /^Code run / })).toHaveLength(0)

        await openHistory()
        expect(within(firstRow()).queryByText('Reviewer feedback')).toBeNull()

        await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))
        expect(screen.getAllByRole('button', { name: /^Code run / })).toHaveLength(5)
        await userEvent.click(screen.getByRole('button', { name: 'View less' }))
        expect(screen.getAllByRole('button', { name: /^Code run / })).toHaveLength(3)

        await userEvent.click(viewButton())
        await waitFor(() => expect(screen.queryAllByRole('button', { name: /^Code run / })).toHaveLength(0))
    })

    it('expands rows independently and points each open caret down', async () => {
        renderWithProviders(<CodeRunHistory runs={RUNS} />)
        await openHistory()

        await userEvent.click(rowToggle('Mar 05, 2026'))
        await userEvent.click(rowToggle('Jan 20, 2026'))

        expect(rowToggle('Mar 05, 2026')).toHaveAttribute('aria-expanded', 'true')
        expect(rowToggle('Feb 10, 2026')).toHaveAttribute('aria-expanded', 'false')
        expect(rowToggle('Jan 20, 2026')).toHaveAttribute('aria-expanded', 'true')
        expect(rowToggle('Mar 05, 2026').querySelector('[data-rotated="down"]')).not.toBeNull()
        expect(rowToggle('Feb 10, 2026').querySelector('[data-rotated]')).toBeNull()

        await userEvent.click(rowToggle('Mar 05, 2026'))

        expect(rowToggle('Mar 05, 2026')).toHaveAttribute('aria-expanded', 'false')
        expect(rowToggle('Mar 05, 2026').querySelector('[data-rotated]')).toBeNull()
        expect(rowToggle('Jan 20, 2026')).toHaveAttribute('aria-expanded', 'true')
    })

    it('shows every run with no View all runs when there are three', async () => {
        renderWithProviders(<CodeRunHistory runs={runsOf(3)} />)
        await openHistory()

        expect(rows()).toHaveLength(3)
        expect(screen.queryByText(/previous runs/)).toBeNull()
        expect(screen.queryByRole('button', { name: 'View all runs' })).toBeNull()
    })

    it('shows the three most recent of four runs with a View all runs button beneath', async () => {
        renderWithProviders(<CodeRunHistory runs={runsOf(4)} />)
        await openHistory()

        expect(rows()).toHaveLength(3)
        expect(screen.getByText('Showing 3 of 4 previous runs')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'View all runs' })).toBeInTheDocument()
    })

    it('View all runs reveals every run and focuses the first one revealed; View less returns focus', async () => {
        renderWithProviders(<CodeRunHistory runs={runsOf(5)} />)
        await openHistory()

        await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))

        expect(rows()).toHaveLength(5)
        expect(screen.getByText('Showing 5 of 5 previous runs')).toBeInTheDocument()
        expect(rowToggle('Jun 15, 2026')).toHaveFocus()
        expect(historyStatus()).toHaveTextContent('Showing all 5 previous runs')
        // The label already says which way it toggles, as on the section toggle.
        expect(screen.getByRole('button', { name: 'View less' })).not.toHaveAttribute('aria-expanded')

        await userEvent.click(screen.getByRole('button', { name: 'View less' }))

        expect(rows()).toHaveLength(3)
        expect(screen.getByText('Showing 3 of 5 previous runs', { selector: 'p' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'View all runs' })).toHaveFocus()
        expect(historyStatus()).toHaveTextContent('Showing 3 of 5 previous runs')
        expect(historyStatus()).toHaveAttribute('aria-live', 'polite')
    })

    it('restores expanded rows, including hidden ones, after View less and View all runs', async () => {
        renderWithProviders(<CodeRunHistory runs={runsOf(5)} />)
        await openHistory()
        await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))
        await userEvent.click(rowToggle('Sep 15, 2026'))
        await userEvent.click(rowToggle('May 15, 2026'))

        await userEvent.click(screen.getByRole('button', { name: 'View less' }))

        expect(rowToggle('Sep 15, 2026')).toHaveAttribute('aria-expanded', 'true')

        await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))

        expect(rowToggle('May 15, 2026')).toHaveAttribute('aria-expanded', 'true')
        expect(rowToggle('Jun 15, 2026')).toHaveAttribute('aria-expanded', 'false')
    })

    it('restores the list length and expanded rows after Hide and View', async () => {
        renderWithProviders(<CodeRunHistory runs={runsOf(5)} />)
        await openHistory()
        await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))
        await userEvent.click(rowToggle('May 15, 2026'))

        await userEvent.click(viewButton())
        await userEvent.click(viewButton())

        expect(rows()).toHaveLength(5)
        expect(screen.getByText('Showing 5 of 5 previous runs')).toBeInTheDocument()
        expect(rowToggle('May 15, 2026')).toHaveAttribute('aria-expanded', 'true')
    })

    it('starts over collapsed, with three rows and none expanded, when mounted again', async () => {
        const { unmount } = renderWithProviders(<CodeRunHistory runs={runsOf(5)} />)
        await openHistory()
        await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))
        await userEvent.click(rowToggle('Sep 15, 2026'))
        unmount()

        renderWithProviders(<CodeRunHistory runs={runsOf(5)} />)

        expect(viewButton()).toHaveAccessibleName('View code run history')
        await openHistory()
        expect(rows()).toHaveLength(3)
        expect(rowToggle('Sep 15, 2026')).toHaveAttribute('aria-expanded', 'false')
    })

    // Tests run in America/Chicago, where a run ending after UTC midnight is still the day before.
    it('hydrates without a mismatch when a run ended after UTC midnight', async () => {
        const { recoverableErrors } = hydrateServerHtml(<CodeRunHistory runs={[run('late', '2026-09-24T01:30:00Z')]} />)

        await waitFor(() => expect(firstRow()).toHaveTextContent('Code run • Sep 23, 2026'))
        expect(recoverableErrors).toEqual([])
    })
})

const daysAgo = (days: number) => dayjs().subtract(days, 'day').toDate()

const WRONG_KEY_ALERT =
    'This run’s outputs were encrypted with your previous security key. Enter that key to view them.'
const LOCKED_MESSAGE = 'Enter security key above to decrypt and review output files.'

// Theme transitions respect reduced motion, and Mantine's Collapse then unmounts what it hides.
const stubReducedMotion = (isOn: boolean) =>
    vi.spyOn(window, 'matchMedia').mockImplementation(
        (query) =>
            ({
                matches: isOn && query.includes('prefers-reduced-motion'),
                media: query,
                addEventListener: () => {},
                removeEventListener: () => {},
            }) as unknown as MediaQueryList,
    )

// Earlier runs take the session user's id, so their feedback can name its author.
const setupLatest = async (priorRunsFor: (userId: string) => PriorCodeRunOptions[] = () => []) => {
    const { org, user } = await mockSessionWithTestData()
    const { study, priorJobs } = await insertTestStudyJobData({
        org,
        jobStatus: 'RUN-COMPLETE',
        priorRuns: priorRunsFor(user.id),
    })
    const latest = await latestJobForStudy(study.id)
    await seedEncryptedArtifact(latest.id, {
        fileType: 'ENCRYPTED-RESULT',
        files: [{ name: 'latest.csv', content: 'a\n1' }],
    })
    return { study, user, latest, priorJobs }
}

const renderHistoryFor = async (studyId: string, latest: Awaited<ReturnType<typeof latestJobForStudy>>) => {
    const priorRuns = await priorCodeRunsForStudy(studyId, latest.id)
    const { container } = renderWithProviders(
        <DecryptAndViewOutputs
            job={latest}
            priorRuns={priorRuns}
            hasDecryptableOutputs
            latestFeedback={[]}
            feedbackLoadError={false}
        />,
    )
    await screen.findByRole('button', { name: 'View files' })
    return container
}

// Newest first: a run the reviewer's current key opens, two encrypted with an older key, and one
// that produced nothing, placed so the oldest old-key run sits beyond the first three.
const setupRuns = async () => {
    const oldKey = await previousKeyPair()
    const encryptedFor = { publicKey: oldKey.exportedPublicKey, fingerprint: oldKey.fingerprint }
    const runs = [
        { days: 3, file: 'matching.csv' },
        { days: 6, file: 'old-a.csv', key: encryptedFor },
        { days: 9, file: null },
        { days: 12, file: 'old-b.csv', key: encryptedFor },
    ]
    const { study, latest, priorJobs } = await setupLatest((userId) =>
        runs.map(({ days, file }) => ({
            ranAt: daysAgo(days),
            feedback: { authorId: userId, text: `feedback for ${file ?? 'the empty run'}` },
        })),
    )
    for (const [index, { file, key }] of runs.entries()) {
        if (!file) continue
        await seedEncryptedArtifact(priorJobs[index].id, {
            fileType: 'ENCRYPTED-RESULT',
            files: [{ name: file, content: 'b\n2' }],
            encryptedFor: key,
        })
    }

    const container = await renderHistoryFor(study.id, latest)
    return { oldKey, container }
}

const rowToggleIn = (row: HTMLElement) => within(row).getByRole('button', { name: /^Code run / })

const expandRow = async (row: HTMLElement) => {
    await userEvent.click(rowToggleIn(row))
    await waitFor(() => expect(within(row).getByTestId('code-run-history-row-body')).toBeVisible())
}

const unlockLatest = async (root: HTMLElement) => {
    const privateKey = await readTestSupportFile('private_key.pem')
    const form = within(root).getByTestId('security-key-form')
    fireEvent.change(within(form).getByRole('textbox'), { target: { value: privateKey } })
    fireEvent.click(within(form).getByRole('button', { name: 'View files' }))
    await within(within(root).getByTestId('code-run-card')).findByTestId('code-run-outputs')
}

const keyInput = (row: HTMLElement) => within(row).getByRole('textbox', { name: /^Security key for Code run / })

const enterRowKey = (row: HTMLElement, key: string) => {
    fireEvent.change(keyInput(row), { target: { value: key } })
    fireEvent.click(within(row).getByRole('button', { name: 'View files' }))
}

describe('decryptedSummary', () => {
    it.each<{ results: RunOutputs[]; message: string }>([
        { results: [], message: 'Outputs decrypted.' },
        { results: [{ status: 'unlocked', files: [] }, { status: 'no-files' }], message: 'Outputs decrypted.' },
        {
            results: [{ status: 'wrong-key' }, { status: 'integrity' }, { status: 'fetch-failed' }],
            message: 'Outputs decrypted. 1 previous run needs a different key. 2 previous runs could not be opened.',
        },
        { results: [{ status: 'integrity' }], message: 'Outputs decrypted. 1 previous run could not be opened.' },
        {
            results: [{ status: 'wrong-key' }, { status: 'wrong-key' }],
            message: 'Outputs decrypted. 2 previous runs need a different key.',
        },
    ])('says "$message"', ({ results, message }) => {
        expect(decryptedSummary(results)).toBe(message)
    })
})

const outputsTitleIn = (container: HTMLElement) => within(container).getByText('Output files', { selector: 'p' })

describe('CodeRunHistory decryption focus and announcements', () => {
    it('focuses the latest outputs and announces one message for every run the key was tried on', async () => {
        const { container } = await setupRuns()
        await openHistory(container)
        await unlockLatest(container)

        expect(
            outputsTitleIn(within(screen.getByTestId('code-run-card')).getByTestId('code-run-outputs')),
        ).toHaveFocus()
        const message = await screen.findByText('Outputs decrypted. 2 previous runs need a different key.')
        expect(message.closest('[role="status"]')).toHaveAttribute('aria-live', 'polite')
        expect(screen.queryByText(/^Outputs decrypted for Code run/)).toBeNull()
        // Runs the latest key opened do not pull focus away from it.
        await expandRow(rows(container)[0])
        expect(await within(rows(container)[0]).findByText('matching.csv')).toBeVisible()
        expect(outputsTitleIn(rows(container)[0])).not.toHaveFocus()
    })

    it('focuses a row’s outputs and announces it when its own key opens it, only once', async () => {
        const { oldKey, container } = await setupRuns()
        await openHistory(container)
        await unlockLatest(container)
        const oldA = rows(container)[1]
        await expandRow(oldA)
        await within(oldA).findByText(WRONG_KEY_ALERT)

        enterRowKey(oldA, oldKey.privateKeyString)

        expect(await within(oldA).findByText('old-a.csv')).toBeVisible()
        await waitFor(() => expect(outputsTitleIn(oldA)).toHaveFocus())
        expect(historyStatus()).toHaveTextContent(/^Outputs decrypted for Code run \w{3} \d{2}, \d{4}\.$/)

        await userEvent.click(rowToggleIn(oldA))
        await expandRow(oldA)
        expect(await within(oldA).findByText('old-a.csv')).toBeVisible()
        expect(rowToggleIn(oldA)).toHaveFocus()
    })

    it('announces again when a second run from the same day is opened with its own key', async () => {
        const oldKey = await previousKeyPair()
        const sameDay = dayjs().subtract(6, 'day')
        const { study, latest, priorJobs } = await setupLatest(() => [
            { ranAt: sameDay.hour(14).toDate() },
            { ranAt: sameDay.hour(10).toDate() },
        ])
        for (const [index, job] of priorJobs.entries()) {
            await seedEncryptedArtifact(job.id, {
                fileType: 'ENCRYPTED-RESULT',
                files: [{ name: `same-day-${index}.csv`, content: 'b\n2' }],
                encryptedFor: { publicKey: oldKey.exportedPublicKey, fingerprint: oldKey.fingerprint },
            })
        }
        const container = await renderHistoryFor(study.id, latest)
        await openHistory(container)
        await unlockLatest(container)
        const [first, second] = rows(container)
        await expandRow(first)
        await expandRow(second)
        // A row shows its own key field only once the latest key has been tried on it.
        await within(first).findByText(WRONG_KEY_ALERT)
        await within(second).findByText(WRONG_KEY_ALERT)

        enterRowKey(first, oldKey.privateKeyString)
        await waitFor(() => expect(outputsTitleIn(first)).toHaveFocus())
        const firstAnnouncement = historyStatus().firstChild
        const firstText = historyStatus().textContent
        enterRowKey(second, oldKey.privateKeyString)
        await waitFor(() => expect(outputsTitleIn(second)).toHaveFocus())

        expect(historyStatus().firstChild).not.toBe(firstAnnouncement)
        expect(historyStatus()).toHaveTextContent((firstText ?? '').trim())
        // Equal text is skipped by VoiceOver in Safari even in a new node, so the raw text must differ.
        expect(historyStatus().textContent).not.toBe(firstText)
    })

    // Mantine 9 keeps a hidden section mounted and re-runs its effects when it is shown again.
    it.each([false, true])(
        'does not move focus to a row’s outputs again after Hide and View (reduced motion: %s)',
        async (reducedMotion) => {
            stubReducedMotion(reducedMotion)
            const { oldKey, container } = await setupRuns()
            await openHistory(container)
            await unlockLatest(container)
            const oldA = rows(container)[1]
            await expandRow(oldA)
            await within(oldA).findByText(WRONG_KEY_ALERT)
            enterRowKey(oldA, oldKey.privateKeyString)
            await waitFor(() => expect(outputsTitleIn(rows(container)[1])).toHaveFocus())

            await userEvent.click(viewButton(container))
            await userEvent.click(viewButton(container))
            await waitFor(() => expect(within(rows(container)[1]).getByText('old-a.csv')).toBeVisible())

            expect(viewButton(container)).toHaveFocus()
        },
    )
})

describe('CodeRunHistory expanded row', () => {
    it('shows the locked state and the run’s own feedback before the latest run is decrypted', async () => {
        await setupRuns()
        await openHistory()

        await expandRow(rows()[0])

        const row = rows()[0]
        expect(within(row).getByText('Output files')).toBeVisible()
        expect(within(row).getByText(LOCKED_MESSAGE)).toBeVisible()
        expect(within(row).getByText('feedback for matching.csv')).toBeVisible()
        expect(within(row).queryByText('feedback for old-a.csv')).toBeNull()
        expect(within(row).queryByTestId('code-run-outputs')).toBeNull()
    })

    it('opens every run the latest key fits as soon as it decrypts, and asks for the old key elsewhere', async () => {
        const { container } = await setupRuns()
        await openHistory(container)
        await unlockLatest(container)

        const [matching, oldA, empty] = rows(container)
        await expandRow(matching)
        await expandRow(oldA)
        await expandRow(empty)

        expect(await within(matching).findByText('matching.csv')).toBeVisible()
        expect(within(matching).queryByText('latest.csv')).toBeNull()
        expect(await within(oldA).findByText(WRONG_KEY_ALERT)).toBeVisible()
        // Inside a row the reviewer chose to open, so it is read in place rather than announced.
        expect(within(oldA).getByText(WRONG_KEY_ALERT).closest('.mantine-Alert-root')).toHaveAttribute('role', 'note')
        expect(within(oldA).queryByRole('alert')).toBeNull()
        expect(within(oldA).getByPlaceholderText('Enter your security key')).toBeVisible()
        expect(within(oldA).queryByText('old-a.csv')).toBeNull()
        expect(within(oldA).getByText('feedback for old-a.csv')).toBeVisible()
        expect(await within(empty).findByText('This run produced no output files.')).toBeVisible()
    })

    it('unlocks only the row its old key was entered in, with errors kept to that row', async () => {
        const { oldKey, container } = await setupRuns()
        await openHistory(container)
        await unlockLatest(container)
        await userEvent.click(within(container).getByRole('button', { name: 'View all runs' }))
        const [, oldA, , oldB] = rows(container)
        await expandRow(oldA)
        await expandRow(oldB)
        await within(oldA).findByText(WRONG_KEY_ALERT)
        await within(oldB).findByText(WRONG_KEY_ALERT)

        // Several key fields can be open at once, so each names its own run with a visible label.
        const labelA = within(oldA).getByText(/^Security key for Code run/)
        expect(labelA).toBeVisible()
        expect(keyInput(oldA)).not.toHaveAttribute('aria-label')
        const labelB = await within(oldB).findByText(/^Security key for Code run/)
        expect(labelA.textContent).not.toEqual(labelB.textContent)

        fireEvent.click(within(oldA).getByRole('button', { name: 'View files' }))
        expect(await within(oldA).findByText('Enter your security key to decrypt the outputs.')).toBeVisible()
        expect(keyInput(oldA)).toHaveAttribute('aria-invalid', 'true')
        expect(keyInput(oldA)).toHaveAccessibleDescription(/Enter your security key to decrypt the outputs\./)

        enterRowKey(oldA, 'not-a-real-key')

        expect(await within(oldA).findByText(/Invalid key/)).toBeVisible()
        expect(keyInput(oldA)).toHaveAccessibleDescription(/Invalid key/)
        expect(within(oldB).queryByText(/Invalid key/)).toBeNull()

        fireEvent.change(keyInput(oldB), { target: { value: 'draft for b' } })
        enterRowKey(oldA, oldKey.privateKeyString)

        expect(await within(oldA).findByText('old-a.csv')).toBeVisible()
        expect(within(oldB).getByText(WRONG_KEY_ALERT)).toBeVisible()
        expect(keyInput(oldB)).toHaveValue('draft for b')
    })

    it.each([false, true])(
        'keeps unsubmitted key text through View less and Hide, in memory only (reduced motion: %s)',
        async (reducedMotion) => {
            stubReducedMotion(reducedMotion)
            const { container } = await setupRuns()
            await openHistory(container)
            await unlockLatest(container)
            await userEvent.click(within(container).getByRole('button', { name: 'View all runs' }))
            await expandRow(rows(container)[3])
            const typed = 'unsubmitted-key-draft'
            fireEvent.change(
                await within(rows(container)[3]).findByRole('textbox', { name: /^Security key for Code run / }),
                {
                    target: { value: typed },
                },
            )

            await userEvent.click(within(container).getByRole('button', { name: 'View less' }))
            await userEvent.click(within(container).getByRole('button', { name: 'View all runs' }))
            await userEvent.click(viewButton(container))
            await openHistory(container)

            expect(keyInput(rows(container)[3])).toHaveValue(typed)
            const stored = [localStorage, sessionStorage].flatMap((storage) =>
                Object.keys(storage).map((key) => storage.getItem(key)),
            )
            expect(stored.join()).not.toContain(typed)
            expect(document.cookie).not.toContain(typed)
        },
    )

    it('reports a tampered run, and says when a run’s outputs could not be loaded', async () => {
        const {
            study,
            latest,
            priorJobs: [tampered, missing],
        } = await setupLatest(() => [{ ranAt: daysAgo(3) }, { ranAt: daysAgo(6) }])
        await seedEncryptedArtifact(tampered.id, {
            fileType: 'ENCRYPTED-RESULT',
            files: [{ name: 'tampered.csv', content: 'c\n3' }],
            tamperWith: { drop: ['tampered.csv'] },
        })
        // A file row whose archive was never stored, so fetching it fails.
        await seedJobFileRow(missing.id, 'ENCRYPTED-RESULT', 'missing.zip')
        const container = await renderHistoryFor(study.id, latest)
        await openHistory(container)
        await unlockLatest(container)

        const [tamperedRow, missingRow] = rows(container)
        await expandRow(tamperedRow)
        await expandRow(missingRow)

        expect(await within(tamperedRow).findByText(ARCHIVE_INTEGRITY_MESSAGE)).toBeVisible()
        expect(within(tamperedRow).queryByText(WRONG_KEY_ALERT)).toBeNull()
        expect(await within(missingRow).findByText(/could not be loaded/)).toBeVisible()
        expect(within(missingRow).queryByText(WRONG_KEY_ALERT)).toBeNull()
    })

    it('never decrypts or shows a Feedback only run’s outputs, before or after the latest run unlocks', async () => {
        const {
            study,
            latest,
            priorJobs: [feedbackOnly],
        } = await setupLatest((userId) => [
            { ranAt: daysAgo(3), decision: 'FILES-REJECTED', feedback: { authorId: userId, text: 'kept back' } },
        ])
        await seedEncryptedArtifact(feedbackOnly.id, {
            fileType: 'ENCRYPTED-RESULT',
            files: [{ name: 'withheld.csv', content: 'd\n4' }],
        })
        const container = await renderHistoryFor(study.id, latest)
        await openHistory(container)
        await expandRow(rows(container)[0])
        const row = rows(container)[0]

        expect(within(row).getByText('Output files were not shared for this run.')).toBeVisible()
        expect(within(row).queryByText(LOCKED_MESSAGE)).toBeNull()
        expect(within(row).getByText('kept back')).toBeVisible()

        await unlockLatest(container)

        expect(await screen.findByText('Outputs decrypted.')).toBeInTheDocument()
        expect(within(row).getByText('Output files were not shared for this run.')).toBeVisible()
        expect(within(row).queryByText('withheld.csv')).toBeNull()
        expect(within(row).queryByPlaceholderText('Enter your security key')).toBeNull()
        expect(within(row).queryByLabelText('Decrypting outputs')).toBeNull()
    })

    it('always shows a Reviewer feedback section, saying when a run has none', async () => {
        renderWithProviders(<CodeRunHistory runs={[run('quiet', '2026-03-05T12:00:00Z')]} />)
        await openHistory()

        await expandRow(firstRow())

        expect(within(firstRow()).getByText('Reviewer feedback')).toBeVisible()
        expect(within(firstRow()).getByText('No feedback was shared for this run.')).toBeVisible()
    })

    it('labels a decision without a version, as the decided page does', async () => {
        const decided = {
            ...run('decided', '2026-03-05T12:00:00Z'),
            feedback: [
                {
                    id: 'decision-2',
                    body: JSON.parse(lexicalJson('second look is fine')),
                    createdAt: '2026-03-06T12:00:00Z',
                    round: 2,
                    authorName: 'Ada Reviewer',
                },
            ],
        }
        renderWithProviders(<CodeRunHistory runs={[decided]} />)
        await openHistory()

        await expandRow(firstRow())

        expect(within(firstRow()).getByText('Reviewer feedback')).toBeVisible()
        expect(within(firstRow()).queryByText(/\(v2\.0\)/)).toBeNull()
    })
})

describe('CodeRunHistory row scrolling', () => {
    const placeHeader = (top: number, height = 40) => {
        const header = rowToggle('Mar 05, 2026').parentElement!
        header.getBoundingClientRect = () => ({ top, bottom: top + height }) as DOMRect
    }

    // The window scrolls under the 64px app header, so a row is only in view below it.
    const setup = async ({ reducedMotion = false } = {}) => {
        stubReducedMotion(reducedMotion)
        const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
        window.innerHeight = 800
        renderWithProviders(<CodeRunHistory runs={RUNS} />)
        await openHistory()
        return scrollBy
    }

    it('does not scroll when the opened row fits', async () => {
        const scrollBy = await setup()
        placeHeader(100)

        await userEvent.click(rowToggle('Mar 05, 2026'))

        expect(scrollBy).not.toHaveBeenCalled()
    })

    it('scrolls just enough to show the header and the start of the content', async () => {
        const scrollBy = await setup()
        placeHeader(700)

        await userEvent.click(rowToggle('Mar 05, 2026'))

        expect(scrollBy).toHaveBeenCalledWith({ top: 100, behavior: 'smooth' })
    })

    it('never scrolls the header under the app header to show more content', async () => {
        const scrollBy = await setup()
        placeHeader(100, 690)

        await userEvent.click(rowToggle('Mar 05, 2026'))

        expect(scrollBy).toHaveBeenCalledWith({ top: 36, behavior: 'smooth' })
    })

    it('brings a header hidden behind the app header back into view when it opens', async () => {
        const scrollBy = await setup()
        placeHeader(30)

        await userEvent.click(rowToggle('Mar 05, 2026'))

        expect(scrollBy).toHaveBeenCalledWith({ top: -34, behavior: 'smooth' })
    })

    it('scrolls back to a header above the viewport when the row collapses', async () => {
        const scrollBy = await setup()
        placeHeader(100)
        await userEvent.click(rowToggle('Mar 05, 2026'))
        placeHeader(-60)

        await userEvent.click(rowToggle('Mar 05, 2026'))

        expect(scrollBy).toHaveBeenCalledWith({ top: -124, behavior: 'smooth' })
    })

    it('View less scrolls the history title back into view when the shorter list leaves it above', async () => {
        stubReducedMotion(false)
        const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
        renderWithProviders(<CodeRunHistory runs={runsOf(5)} />)
        await openHistory()
        await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))
        const title = screen.getByRole('heading', { name: 'Code run history (5)' })
        title.getBoundingClientRect = () => ({ top: -278, bottom: -250 }) as DOMRect

        await userEvent.click(screen.getByRole('button', { name: 'View less' }))

        expect(scrollBy).toHaveBeenCalledWith({ top: -342, behavior: 'smooth' })
        expect(screen.getByRole('button', { name: 'View all runs' })).toHaveFocus()
    })

    it('jumps instead of animating when reduced motion is preferred', async () => {
        const scrollBy = await setup({ reducedMotion: true })
        placeHeader(700)

        await userEvent.click(rowToggle('Mar 05, 2026'))

        expect(scrollBy).toHaveBeenCalledWith({ top: 100, behavior: 'auto' })
    })
})

describe('historyKeySummary', () => {
    it.each<{ results: RunOutputs[]; message: string }>([
        { results: [{ status: 'unlocked', files: [] }], message: 'Outputs decrypted for 1 previous run.' },
        {
            results: [{ status: 'unlocked', files: [] }, { status: 'unlocked', files: [] }, { status: 'wrong-key' }],
            message: 'Outputs decrypted for 2 previous runs. 1 previous run needs a different key.',
        },
        {
            results: [{ status: 'unlocked', files: [] }, { status: 'fetch-failed' }],
            message: 'Outputs decrypted for 1 previous run. 1 previous run could not be opened.',
        },
    ])('says "$message"', ({ results, message }) => {
        expect(historyKeySummary(results)).toBe(message)
    })
})

describe('keyAttemptOutcome', () => {
    it.each<{ results: RunOutputs[]; outcome: string }>([
        { results: [{ status: 'wrong-key' }, { status: 'unlocked', files: [] }], outcome: 'accepted' },
        {
            results: [{ status: 'wrong-key' }, { status: 'integrity' }, { status: 'fetch-failed' }],
            outcome: 'integrity',
        },
        { results: [{ status: 'wrong-key' }, { status: 'fetch-failed' }], outcome: 'fetch-failed' },
        { results: [{ status: 'wrong-key' }], outcome: 'wrong-key' },
        { results: [], outcome: 'wrong-key' },
    ])('is $outcome', ({ results, outcome }) => {
        expect(keyAttemptOutcome(results)).toBe(outcome)
    })
})

type ResearcherRunOptions = {
    round?: number
    ranAt?: string
    decidedAt?: string
    decision?: 'FILES-APPROVED' | 'FILES-REJECTED'
    codeFiles?: string[]
}

const researcherRun = (
    id: string,
    {
        round = 1,
        ranAt = '2026-03-05T12:00:00Z',
        decidedAt = '2026-03-07T12:00:00Z',
        decision = 'FILES-APPROVED',
        codeFiles = [],
    }: ResearcherRunOptions = {},
) => ({
    id,
    round,
    ranAt: new Date(ranAt),
    statusChanges: [
        { status: 'CODE-SUBMITTED' as const, createdAt: ranAt },
        { status: 'RUN-COMPLETE' as const, createdAt: ranAt },
        { status: decision, createdAt: decidedAt },
    ],
    codeFiles: codeFiles.map((name, index) => ({
        id: `${id}-${name}`,
        name,
        fileType: index === 0 ? ('MAIN-CODE' as const) : ('SUPPLEMENTAL-CODE' as const),
    })),
    feedback: [],
})

const isBefore = (first: Element, second: Element) =>
    !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

const codeFilesIn = (row: HTMLElement) => within(row).queryByTestId('code-run-history-code-files')

describe('CodeRunHistory for the research lab', () => {
    it('dates a row by the decision on it, where the data partner dates it by the run end', async () => {
        const runs = [researcherRun('decided', { ranAt: '2026-03-05T12:00:00Z', decidedAt: '2026-03-07T12:00:00Z' })]
        const { unmount } = renderWithProviders(<CodeRunHistory role="researcher" runs={runs} />)
        await openHistory()
        expect(rowToggle('Mar 07, 2026')).toBeInTheDocument()
        unmount()

        renderWithProviders(<CodeRunHistory runs={runs} />)
        await openHistory()
        expect(rowToggle('Mar 05, 2026')).toBeInTheDocument()
    })

    it('lists each run’s own code files under its own version, with download as the only action', async () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null)
        const runs = [
            researcherRun('v3', { round: 3, decidedAt: '2026-03-09T12:00:00Z', codeFiles: ['third.R', 'shared.R'] }),
            researcherRun('v2', { round: 2, decidedAt: '2026-03-08T12:00:00Z', codeFiles: ['second.R', 'shared.R'] }),
            researcherRun('v1', { round: 1, decidedAt: '2026-03-07T12:00:00Z', codeFiles: ['first.R'] }),
        ]
        renderWithProviders(<CodeRunHistory role="researcher" runs={runs} />)
        await openHistory()
        for (const row of rows()) await expandRow(row)

        const [v3, v2, v1] = rows()
        const fileNames = (row: HTMLElement) =>
            within(codeFilesIn(row)!)
                .getAllByRole('row')
                .slice(1)
                .map((tableRow) => within(tableRow).getAllByRole('cell')[0].textContent)
        expect(within(v3).getByText('Code files v3')).toBeVisible()
        expect(within(v2).getByText('Code files v2')).toBeVisible()
        expect(within(v1).getByText('Code files v1')).toBeVisible()
        expect(fileNames(v3)).toEqual(['third.R', 'shared.R'])
        expect(fileNames(v2)).toEqual(['second.R', 'shared.R'])
        expect(fileNames(v1)).toEqual(['first.R'])
        expect(within(codeFilesIn(v2)!).getByRole('columnheader', { name: 'File name' })).toBeVisible()
        expect(within(codeFilesIn(v2)!).getByRole('columnheader', { name: 'Actions' })).toBeVisible()
        expect(
            within(codeFilesIn(v2)!)
                .getAllByRole('button')
                .map((button) => button.getAttribute('aria-label')),
        ).toEqual(['Download second.R', 'Download shared.R'])
        expect(within(codeFilesIn(v2)!).queryByRole('button', { name: /star|edit|delete|main/i })).toBeNull()

        await userEvent.click(within(v2).getByRole('button', { name: 'Download shared.R' }))

        expect(open).toHaveBeenCalledWith(studyCodeURL('v2', 'shared.R'))
    })

    it('orders a row as Code files, Output files, then Reviewer feedback', async () => {
        renderWithProviders(<CodeRunHistory role="researcher" runs={[researcherRun('only', { codeFiles: ['a.R'] })]} />)
        await openHistory()
        await expandRow(firstRow())

        const row = firstRow()
        const codeFiles = within(row).getByText('Code files v1')
        const outputs = within(row).getByText('Output files')
        const feedback = within(row).getByText('Reviewer feedback')
        expect(isBefore(within(row).getByRole('separator'), codeFiles)).toBe(true)
        expect(isBefore(codeFiles, outputs)).toBe(true)
        expect(isBefore(outputs, feedback)).toBe(true)
    })

    it('shows the code files and the Output files title for a locked run and a feedback-only run', async () => {
        const runs = [
            researcherRun('shared', { codeFiles: ['shared.R'], decidedAt: '2026-03-08T12:00:00Z' }),
            researcherRun('withheld', { codeFiles: ['withheld.R'], decision: 'FILES-REJECTED' }),
        ]
        renderWithProviders(<CodeRunHistory role="researcher" runs={runs} />)
        await openHistory()
        const [shared, withheld] = rows()
        await expandRow(shared)
        await expandRow(withheld)

        expect(within(shared).getByText('shared.R')).toBeVisible()
        expect(within(shared).getByText('Output files')).toBeVisible()
        expect(within(shared).getByText(LOCKED_MESSAGE)).toBeVisible()
        expect(within(withheld).getByText('withheld.R')).toBeVisible()
        expect(within(withheld).getByText('Output files')).toBeVisible()
        expect(within(withheld).getByText('Output files were not shared for this run.')).toBeVisible()
        expect(within(withheld).queryByText(LOCKED_MESSAGE)).toBeNull()
        expect(within(withheld).queryByRole('textbox')).toBeNull()
        expect(within(withheld).queryByText(WRONG_KEY_ALERT)).toBeNull()
    })

    it('says when a run has no code files', async () => {
        renderWithProviders(<CodeRunHistory role="researcher" runs={[researcherRun('empty')]} />)
        await openHistory()
        await expandRow(firstRow())

        expect(within(firstRow()).getByText('No code files were uploaded.')).toBeVisible()
    })

    it('keeps the data partner rows free of code files, with the Output files title on feedback-only rows', async () => {
        const runs = [researcherRun('withheld', { codeFiles: ['withheld.R'], decision: 'FILES-REJECTED' })]
        renderWithProviders(<CodeRunHistory runs={runs} />)
        await openHistory()
        await expandRow(firstRow())

        expect(codeFilesIn(firstRow())).toBeNull()
        expect(within(firstRow()).queryByText(/^Code files/)).toBeNull()
        expect(within(firstRow()).getByText('Output files')).toBeVisible()
        expect(within(firstRow()).getByText('Output files were not shared for this run.')).toBeVisible()
    })

    it('keeps the list and expanded rows through Hide and View, as on the data partner side', async () => {
        const runs = [
            researcherRun('a', { decidedAt: '2026-03-09T12:00:00Z' }),
            researcherRun('b', { decidedAt: '2026-03-08T12:00:00Z' }),
        ]
        renderWithProviders(<CodeRunHistory role="researcher" runs={runs} />)
        await openHistory()
        await expandRow(rows()[1])

        await userEvent.click(viewButton())
        expect(viewButton()).toHaveAccessibleName('View code run history')
        await openHistory()

        expect(viewButton()).toHaveAccessibleName('Hide code run history')
        expect(rowToggle('Mar 08, 2026')).toHaveAttribute('aria-expanded', 'true')
        expect(rowToggle('Mar 09, 2026')).toHaveAttribute('aria-expanded', 'false')
    })
})

const historyKeyPanel = () => screen.queryByTestId('code-run-history-key')
const historyKeyInput = () => within(historyKeyPanel()!).getByRole('textbox', { name: 'Security key' })
const historyTitle = () => screen.getByRole('heading', { name: /^Code run history/ })

const enterHistoryKey = (key: string) => {
    fireEvent.change(historyKeyInput(), { target: { value: key } })
    fireEvent.click(within(historyKeyPanel()!).getByRole('button', { name: 'View files' }))
}

type ResearcherPriorRun = {
    days: number
    files?: string[]
    decision?: 'FILES-APPROVED' | 'FILES-REJECTED'
    wrapFor?: { publicKey: ArrayBuffer; fingerprint: string }
}

// A research lab member's study whose latest run shared feedback only. Earlier runs are shared for
// the member's current key unless they name an earlier one.
const setupResearcherHistory = async (runs: ResearcherPriorRun[]) => {
    const { org, user } = await mockSessionWithTestData({ orgSlug: 'test-lab', orgType: 'lab' })
    const { study, job, priorJobs } = await insertTestStudyJobData({
        org,
        researcherId: user.id,
        jobStatus: 'RUN-COMPLETE',
        priorRuns: runs.map(({ days, decision }) => ({
            ranAt: daysAgo(days),
            decision,
            feedback: { authorId: user.id, text: `feedback ${days}` },
        })),
    })
    for (const [index, { files, wrapFor }] of runs.entries()) {
        if (!files) continue
        await seedEncryptedArtifact(priorJobs[index].id, {
            fileType: 'ENCRYPTED-RESULT',
            files: files.map((name) => ({ name, content: 'x\n1' })),
            sharedWith: user.id,
            wrapFor,
        })
    }
    const priorRuns = await priorCodeRunsForStudy(study.id, job.id)
    return { user, priorJobs, priorRuns }
}

const oldResearcherKey = async () => {
    const key = await previousKeyPair()
    return { key, wrapFor: { publicKey: key.exportedPublicKey, fingerprint: key.fingerprint } }
}

// Newest first: two runs for the current key (one beyond the first three rows), one for an old key,
// and one feedback-only run.
const setupMixedHistory = async () => {
    const old = await oldResearcherKey()
    const setup = await setupResearcherHistory([
        { days: 3, files: ['current-a.csv', 'current-a2.csv'] },
        { days: 6, decision: 'FILES-REJECTED' },
        { days: 9, files: ['old-b.csv'], wrapFor: old.wrapFor },
        { days: 12, files: ['current-c.csv'] },
    ])
    const { unmount } = renderWithProviders(<ResearcherCodeRunHistory runs={setup.priorRuns} withHistoryKey />)
    return { ...setup, oldKey: old.key, unmount }
}

describe('CodeRunHistory security key for earlier runs', () => {
    it('shows the input above the rows in both list lengths, and locks shared rows until a key opens them', async () => {
        await setupMixedHistory()
        await openHistory()

        expect(historyKeyInput()).toBeVisible()
        expect(within(historyKeyPanel()!).getByText(/access outputs from previous code runs/)).toBeVisible()
        expect(isBefore(historyKeyPanel()!, rows()[0])).toBe(true)
        const [shared, withheld] = rows()
        await expandRow(shared)
        await expandRow(withheld)
        expect(within(shared).getByText(LOCKED_MESSAGE)).toBeVisible()
        expect(within(withheld).getByText('Output files were not shared for this run.')).toBeVisible()
        expect(within(withheld).queryByText(LOCKED_MESSAGE)).toBeNull()

        await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))

        expect(rows()).toHaveLength(4)
        expect(isBefore(historyKeyPanel()!, rows()[0])).toBe(true)
    })

    it('asks for a key when empty and rejects one that opens no run, leaving every row locked', async () => {
        await setupMixedHistory()
        await openHistory()
        await expandRow(rows()[0])

        fireEvent.click(within(historyKeyPanel()!).getByRole('button', { name: 'View files' }))
        expect(
            await within(historyKeyPanel()!).findByText('Enter your security key to decrypt the outputs.'),
        ).toBeVisible()
        await waitFor(() => expect(historyKeyInput()).toHaveFocus())

        fireEvent.change(historyKeyInput(), { target: { value: 'typing' } })
        expect(within(historyKeyPanel()!).queryByText('Enter your security key to decrypt the outputs.')).toBeNull()

        const unrelated = await unrelatedKeyPair()
        enterHistoryKey(unrelated.privateKeyString)

        expect(await within(historyKeyPanel()!).findByText(/Invalid key/)).toBeVisible()
        expect(within(rows()[0]).getByText(LOCKED_MESSAGE)).toBeVisible()
        expect(within(rows()[0]).queryByTestId('code-run-outputs')).toBeNull()
        expect(screen.queryByText(/Outputs decrypted/)).toBeNull()
    })

    it('opens every run the key fits, leaves the rest their own key, and removes itself', async () => {
        const { oldKey } = await setupMixedHistory()
        await openHistory()
        const [currentA, , oldB] = rows()
        await expandRow(currentA)
        await expandRow(oldB)

        enterHistoryKey(await readTestSupportFile('private_key.pem'))

        await waitFor(() => expect(historyKeyPanel()).toBeNull())
        await waitFor(() => expect(historyTitle()).toHaveFocus())
        expect(historyStatus()).toHaveTextContent(
            'Outputs decrypted for 2 previous runs. 1 previous run needs a different key.',
        )
        expect(await within(currentA).findByText('current-a.csv')).toBeVisible()
        expect(within(currentA).getByTestId('outputs-download-all')).toHaveAttribute('data-variant', 'subtle')
        expect(within(currentA).queryByText(LOCKED_MESSAGE)).toBeNull()
        expect(within(oldB).getByText(WRONG_KEY_ALERT)).toBeVisible()
        expect(within(oldB).getByPlaceholderText('Enter your security key')).toBeVisible()
        expect(within(oldB).queryByText(LOCKED_MESSAGE)).toBeNull()

        await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))
        await expandRow(rows()[3])
        expect(await within(rows()[3]).findByText('current-c.csv')).toBeVisible()

        enterRowKey(oldB, oldKey.privateKeyString)
        expect(await within(oldB).findByText('old-b.csv')).toBeVisible()
        expect(within(rows()[3]).getByText('current-c.csv')).toBeVisible()
    })

    it('shows every row in exactly one state while the key is tried and once it is accepted', async () => {
        await setupMixedHistory()
        await openHistory()
        const [currentA, , oldB] = rows()
        await expandRow(currentA)
        await expandRow(oldB)

        enterHistoryKey(await readTestSupportFile('private_key.pem'))

        expect(within(historyKeyPanel()!).getByRole('button', { name: 'Decrypting' })).toBeDisabled()
        for (const row of [currentA, oldB]) {
            expect(within(row).getByText(LOCKED_MESSAGE)).toBeVisible()
            expect(within(row).queryByTestId('code-run-outputs')).toBeNull()
            expect(within(row).queryByText(WRONG_KEY_ALERT)).toBeNull()
        }

        await waitFor(() => expect(historyKeyPanel()).toBeNull())
        expect(await within(currentA).findByTestId('code-run-outputs')).toBeVisible()
        expect(within(currentA).queryByText(LOCKED_MESSAGE)).toBeNull()
        expect(within(currentA).queryByText(WRONG_KEY_ALERT)).toBeNull()
        expect(within(oldB).getByText(WRONG_KEY_ALERT)).toBeVisible()
        expect(within(oldB).queryByText(LOCKED_MESSAGE)).toBeNull()
        expect(within(oldB).queryByTestId('code-run-outputs')).toBeNull()
    })

    it('opens a run shared for an earlier key with that key, and only that run', async () => {
        const { oldKey } = await setupMixedHistory()
        await openHistory()
        await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))
        const [currentA, , oldB, currentC] = rows()
        for (const row of [currentA, oldB, currentC]) await expandRow(row)

        enterHistoryKey(oldKey.privateKeyString)

        await waitFor(() => expect(historyKeyPanel()).toBeNull())
        expect(await within(oldB).findByText('old-b.csv')).toBeVisible()
        expect(within(currentA).getByText(WRONG_KEY_ALERT)).toBeVisible()
        expect(within(currentC).getByText(WRONG_KEY_ALERT)).toBeVisible()
    })

    it('keeps unsubmitted text through View all, View less and Hide, in memory only', async () => {
        await setupMixedHistory()
        await openHistory()
        const typed = 'unsubmitted-history-key'
        fireEvent.change(historyKeyInput(), { target: { value: typed } })

        await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))
        await userEvent.click(screen.getByRole('button', { name: 'View less' }))
        await userEvent.click(viewButton())
        await openHistory()

        expect(historyKeyInput()).toHaveValue(typed)
        const stored = [localStorage, sessionStorage].flatMap((storage) =>
            Object.keys(storage).map((key) => storage.getItem(key)),
        )
        expect(stored.join()).not.toContain(typed)
        expect(document.cookie).not.toContain(typed)
    })

    it('lets a key be tried again after the history was hidden while one was being tried', async () => {
        await setupMixedHistory()
        await openHistory()

        enterHistoryKey((await unrelatedKeyPair()).privateKeyString)
        // Synchronous, so the history hides while the key is still being tried.
        fireEvent.click(viewButton())
        expect(viewButton()).toHaveAccessibleName('View code run history')
        // The hidden form still settles: by text, because role queries skip hidden content.
        await waitFor(() => expect(within(historyKeyPanel()!).getByText(/Invalid key/)).toBeInTheDocument())

        await openHistory()

        expect(historyKeyInput()).toBeEnabled()
        expect(within(historyKeyPanel()!).getByRole('button', { name: 'View files' })).toBeEnabled()
    })

    it('starts over with an empty input when mounted again', async () => {
        const { priorRuns, unmount } = await setupMixedHistory()
        await openHistory()
        await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))
        enterHistoryKey(await readTestSupportFile('private_key.pem'))
        await waitFor(() => expect(historyKeyPanel()).toBeNull())
        unmount()

        renderWithProviders(<ResearcherCodeRunHistory runs={priorRuns} withHistoryKey />)
        expect(viewButton()).toHaveAccessibleName('View code run history')
        await openHistory()

        expect(historyKeyInput()).toHaveValue('')
        expect(rows()).toHaveLength(3)
        for (const row of rows()) expect(rowToggleIn(row)).toHaveAttribute('aria-expanded', 'false')
    })

    it('is not shown when the page does not ask for it', async () => {
        const { priorRuns } = await setupResearcherHistory([{ days: 3, files: ['a.csv'] }])
        renderWithProviders(<ResearcherCodeRunHistory runs={priorRuns} withHistoryKey={false} />)
        await openHistory()

        expect(historyKeyPanel()).toBeNull()
    })

    it('reports a tampered run instead of calling the key wrong', async () => {
        const { priorJobs, user, priorRuns } = await setupResearcherHistory([{ days: 3 }])
        await seedEncryptedArtifact(priorJobs[0].id, {
            fileType: 'ENCRYPTED-RESULT',
            files: [{ name: 'tampered.csv', content: 'c\n3' }],
            sharedWith: user.id,
            tamperWith: { drop: ['tampered.csv'] },
        })
        renderWithProviders(<ResearcherCodeRunHistory runs={priorRuns} withHistoryKey />)
        await openHistory()

        enterHistoryKey(await readTestSupportFile('private_key.pem'))

        expect(await within(historyKeyPanel()!).findByText(ARCHIVE_INTEGRITY_MESSAGE)).toBeVisible()
        expect(within(historyKeyPanel()!).queryByText(/Invalid key/)).toBeNull()
    })

    it('says the outputs could not be loaded when every fetch fails, not that the key is wrong', async () => {
        const { priorJobs, priorRuns } = await setupResearcherHistory([{ days: 3 }])
        // Wrapped for the test key, but its archive was never stored, so fetching it fails.
        const { id } = await seedJobFileRow(priorJobs[0].id, 'ENCRYPTED-RESULT', 'missing.zip')
        const fingerprint = await fingerprintKeyData(pemToArrayBuffer(await readTestSupportFile('public_key.pem')))
        await db
            .insertInto('studyJobFileRecipientKey')
            .values({ studyJobFileId: id, filePath: 'missing.csv', fingerprint, crypt: 'unused' })
            .execute()
        renderWithProviders(<ResearcherCodeRunHistory runs={priorRuns} withHistoryKey />)
        await openHistory()

        enterHistoryKey(await readTestSupportFile('private_key.pem'))

        expect(
            await within(historyKeyPanel()!).findByText(
                'The outputs could not be loaded. Refresh the page to try again.',
            ),
        ).toBeVisible()
        expect(within(historyKeyPanel()!).queryByText(/Invalid key/)).toBeNull()
    })
})
