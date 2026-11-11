import {
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
import { seedEncryptedArtifact, seedJobFileRow } from '@/tests/artifact.helpers'
import { generateKeyPair } from 'si-encryption/util/keypair'
import dayjs from 'dayjs'
import type { StudyJobStatus } from '@/database/types'
import { ARCHIVE_INTEGRITY_MESSAGE } from '@/hooks/use-decrypt-files'
import { lexicalJson } from '@/lib/lexical'
import { latestJobForStudy, priorCodeRunsForStudy } from '@/server/db/queries'
import { CodeRunHistory } from './code-run-history'
import { DecryptAndViewOutputs } from './decrypt-and-view-outputs'

const run = (
    id: string,
    ranAt: string,
    statuses: StudyJobStatus[] = ['CODE-SUBMITTED', 'RUN-COMPLETE', 'FILES-APPROVED'],
) => ({
    id,
    ranAt: new Date(ranAt),
    statusChanges: statuses.map((status) => ({ status })),
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

const viewButton = () => screen.getByRole('button', { name: /^(View|Hide) code run history$/ })
const rows = () => screen.getAllByTestId('code-run-history-row')
const firstRow = () => rows()[0]
const rowToggle = (date: string) => screen.getByRole('button', { name: `Code run ${date}` })

const openHistory = async () => {
    await userEvent.click(viewButton())
    await waitFor(() => expect(firstRow()).toBeVisible())
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

    it('expands rows independently and turns each caret', async () => {
        renderWithProviders(<CodeRunHistory runs={RUNS} />)
        await openHistory()

        await userEvent.click(rowToggle('Mar 05, 2026'))
        await userEvent.click(rowToggle('Jan 20, 2026'))

        expect(rowToggle('Mar 05, 2026')).toHaveAttribute('aria-expanded', 'true')
        expect(rowToggle('Feb 10, 2026')).toHaveAttribute('aria-expanded', 'false')
        expect(rowToggle('Jan 20, 2026')).toHaveAttribute('aria-expanded', 'true')
        expect(rowToggle('Mar 05, 2026').querySelector('[data-rotated]')).not.toBeNull()

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

        await userEvent.click(screen.getByRole('button', { name: 'View less' }))

        expect(rows()).toHaveLength(3)
        expect(screen.getByText('Showing 3 of 5 previous runs')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'View all runs' })).toHaveFocus()
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
    renderWithProviders(<DecryptAndViewOutputs job={latest} priorRuns={priorRuns} isVisible />)
    await screen.findByRole('button', { name: 'View files' })
}

// Newest first: a run the reviewer's current key opens, two encrypted with an older key, and one
// that produced nothing, placed so the oldest old-key run sits beyond the first three.
const setupRuns = async () => {
    const oldKey = await generateKeyPair()
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

    await renderHistoryFor(study.id, latest)
    return { oldKey }
}

const rowToggleIn = (row: HTMLElement) => within(row).getByRole('button', { name: /^Code run / })

const expandRow = async (row: HTMLElement) => {
    await userEvent.click(rowToggleIn(row))
    await waitFor(() => expect(within(row).getByTestId('code-run-history-row-body')).toBeVisible())
}

const unlockLatest = async () => {
    const form = screen.getByTestId('security-key-form')
    fireEvent.change(within(form).getByRole('textbox'), {
        target: { value: await readTestSupportFile('private_key.pem') },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'View files' }))
    await screen.findByTestId('outputs-files-section')
}

const keyInput = (row: HTMLElement) => within(row).getByRole('textbox', { name: 'Security key' })

const enterRowKey = (row: HTMLElement, key: string) => {
    fireEvent.change(keyInput(row), { target: { value: key } })
    fireEvent.click(within(row).getByRole('button', { name: 'View files' }))
}

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
        await setupRuns()
        await openHistory()
        await unlockLatest()

        const [matching, oldA, empty] = rows()
        await expandRow(matching)
        await expandRow(oldA)
        await expandRow(empty)

        expect(await within(matching).findByText('matching.csv')).toBeVisible()
        expect(within(matching).queryByText('latest.csv')).toBeNull()
        expect(await within(oldA).findByText(WRONG_KEY_ALERT)).toBeVisible()
        expect(within(oldA).getByPlaceholderText('Enter your security key')).toBeVisible()
        expect(within(oldA).queryByText('old-a.csv')).toBeNull()
        expect(within(oldA).getByText('feedback for old-a.csv')).toBeVisible()
        expect(await within(empty).findByText('This run produced no output files.')).toBeVisible()
    })

    it('unlocks only the row its old key was entered in, with errors kept to that row', async () => {
        const { oldKey } = await setupRuns()
        await openHistory()
        await unlockLatest()
        await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))
        const [, oldA, , oldB] = rows()
        await expandRow(oldA)
        await expandRow(oldB)
        await within(oldA).findByText(WRONG_KEY_ALERT)

        enterRowKey(oldA, 'not-a-real-key')

        expect(await within(oldA).findByText(/Invalid key/)).toBeVisible()
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
            await setupRuns()
            await openHistory()
            await unlockLatest()
            await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))
            await expandRow(rows()[3])
            const typed = 'unsubmitted-key-draft'
            fireEvent.change(await within(rows()[3]).findByRole('textbox', { name: 'Security key' }), {
                target: { value: typed },
            })

            await userEvent.click(screen.getByRole('button', { name: 'View less' }))
            await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))
            await userEvent.click(viewButton())
            await openHistory()

            expect(keyInput(rows()[3])).toHaveValue(typed)
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
        await renderHistoryFor(study.id, latest)
        await openHistory()
        await unlockLatest()

        const [tamperedRow, missingRow] = rows()
        await expandRow(tamperedRow)
        await expandRow(missingRow)

        expect(await within(tamperedRow).findByText(ARCHIVE_INTEGRITY_MESSAGE)).toBeVisible()
        expect(within(tamperedRow).queryByText(WRONG_KEY_ALERT)).toBeNull()
        expect(await within(missingRow).findByText(/could not be loaded/)).toBeVisible()
        expect(within(missingRow).queryByText(WRONG_KEY_ALERT)).toBeNull()
    })

    it('always shows a Reviewer feedback section, saying when a run has none', async () => {
        renderWithProviders(<CodeRunHistory runs={[run('quiet', '2026-03-05T12:00:00Z')]} />)
        await openHistory()

        await expandRow(firstRow())

        expect(within(firstRow()).getByText('Reviewer feedback')).toBeVisible()
        expect(within(firstRow()).getByText('No feedback was shared for this run.')).toBeVisible()
    })

    it('labels a decision with its version, as the decided page does', async () => {
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

        expect(within(firstRow()).getByText('Reviewer feedback (v2.0)')).toBeVisible()
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

    it('jumps instead of animating when reduced motion is preferred', async () => {
        const scrollBy = await setup({ reducedMotion: true })
        placeHeader(700)

        await userEvent.click(rowToggle('Mar 05, 2026'))

        expect(scrollBy).toHaveBeenCalledWith({ top: 100, behavior: 'auto' })
    })
})
