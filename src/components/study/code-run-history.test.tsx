import {
    describe,
    expect,
    fireEvent,
    hydrateServerHtml,
    insertTestPriorCodeRun,
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
import { seedEncryptedArtifact } from '@/tests/artifact.helpers'
import { generateKeyPair } from 'si-encryption/util/keypair'
import dayjs from 'dayjs'
import type { StudyJobStatus } from '@/database/types'
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
// Rows beyond the first three stay mounted but hidden, so their unsubmitted key text survives View less.
const rows = () => screen.getAllByTestId('code-run-history-row').filter((row) => !row.hidden)
const firstRow = () => rows()[0]
const caret = (date: string) => screen.getByRole('button', { name: `Code run • ${date}` })

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

        expect(viewButton()).toHaveTextContent('View code run history')
        expect(viewButton()).toHaveAttribute('aria-expanded', 'false')
        expect(firstRow()).not.toBeVisible()
    })

    it('expands in place to list the runs newest first, each collapsed, and Hide collapses it again', async () => {
        renderWithProviders(<CodeRunHistory runs={RUNS} />)

        await openHistory()

        expect(viewButton()).toHaveTextContent('Hide code run history')
        expect(viewButton()).toHaveAttribute('aria-expanded', 'true')
        expect(viewButton()).toHaveAttribute('type', 'button')
        expect(rows().map((row) => within(row).getByRole('heading').textContent)).toEqual([
            'Code run • Mar 05, 2026',
            'Code run • Feb 10, 2026',
            'Code run • Jan 20, 2026',
        ])
        for (const date of ['Mar 05, 2026', 'Feb 10, 2026', 'Jan 20, 2026']) {
            expect(caret(date)).toHaveAttribute('aria-expanded', 'false')
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

    it('expands rows independently and turns each caret', async () => {
        renderWithProviders(<CodeRunHistory runs={RUNS} />)
        await openHistory()

        await userEvent.click(caret('Mar 05, 2026'))
        await userEvent.click(caret('Jan 20, 2026'))

        expect(caret('Mar 05, 2026')).toHaveAttribute('aria-expanded', 'true')
        expect(caret('Feb 10, 2026')).toHaveAttribute('aria-expanded', 'false')
        expect(caret('Jan 20, 2026')).toHaveAttribute('aria-expanded', 'true')
        expect(caret('Mar 05, 2026').querySelector('[data-rotated]')).not.toBeNull()

        await userEvent.click(caret('Mar 05, 2026'))

        expect(caret('Mar 05, 2026')).toHaveAttribute('aria-expanded', 'false')
        expect(caret('Mar 05, 2026').querySelector('[data-rotated]')).toBeNull()
        expect(caret('Jan 20, 2026')).toHaveAttribute('aria-expanded', 'true')
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
        expect(caret('Jun 15, 2026')).toHaveFocus()

        await userEvent.click(screen.getByRole('button', { name: 'View less' }))

        expect(rows()).toHaveLength(3)
        expect(screen.getByText('Showing 3 of 5 previous runs')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'View all runs' })).toHaveFocus()
    })

    it('restores expanded rows, including hidden ones, after View less and View all runs', async () => {
        renderWithProviders(<CodeRunHistory runs={runsOf(5)} />)
        await openHistory()
        await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))
        await userEvent.click(caret('Sep 15, 2026'))
        await userEvent.click(caret('May 15, 2026'))

        await userEvent.click(screen.getByRole('button', { name: 'View less' }))

        expect(caret('Sep 15, 2026')).toHaveAttribute('aria-expanded', 'true')

        await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))

        expect(caret('May 15, 2026')).toHaveAttribute('aria-expanded', 'true')
        expect(caret('Jun 15, 2026')).toHaveAttribute('aria-expanded', 'false')
    })

    it('restores the list length and expanded rows after Hide and View', async () => {
        renderWithProviders(<CodeRunHistory runs={runsOf(5)} />)
        await openHistory()
        await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))
        await userEvent.click(caret('May 15, 2026'))

        await userEvent.click(viewButton())
        await userEvent.click(viewButton())

        expect(rows()).toHaveLength(5)
        expect(screen.getByText('Showing 5 of 5 previous runs')).toBeInTheDocument()
        expect(caret('May 15, 2026')).toHaveAttribute('aria-expanded', 'true')
    })

    it('starts over collapsed, with three rows and none expanded, when mounted again', async () => {
        const { unmount } = renderWithProviders(<CodeRunHistory runs={runsOf(5)} />)
        await openHistory()
        await userEvent.click(screen.getByRole('button', { name: 'View all runs' }))
        await userEvent.click(caret('Sep 15, 2026'))
        unmount()

        renderWithProviders(<CodeRunHistory runs={runsOf(5)} />)

        expect(viewButton()).toHaveAttribute('aria-expanded', 'false')
        await openHistory()
        expect(rows()).toHaveLength(3)
        expect(caret('Sep 15, 2026')).toHaveAttribute('aria-expanded', 'false')
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

// Newest first: a run the reviewer's current key opens, two encrypted with an older key, and one
// that produced nothing, placed so the oldest old-key run sits beyond the first three.
const setupRuns = async () => {
    const { org, user } = await mockSessionWithTestData()
    const { study } = await insertTestStudyJobData({ org, jobStatus: 'RUN-COMPLETE' })
    const latest = await latestJobForStudy(study.id)
    await seedEncryptedArtifact(latest.id, {
        fileType: 'ENCRYPTED-RESULT',
        files: [{ name: 'latest.csv', content: 'a\n1' }],
    })
    const oldKey = await generateKeyPair()
    const encryptedFor = { publicKey: oldKey.exportedPublicKey, fingerprint: oldKey.fingerprint }

    const seedRun = async (days: number, file: string | null, key?: typeof encryptedFor) => {
        const job = await insertTestPriorCodeRun(study.id, {
            ranAt: daysAgo(days),
            feedback: { authorId: user.id, text: `feedback for ${file ?? 'the empty run'}` },
        })
        if (file) {
            await seedEncryptedArtifact(job.id, {
                fileType: 'ENCRYPTED-RESULT',
                files: [{ name: file, content: 'b\n2' }],
                encryptedFor: key,
            })
        }
    }
    await seedRun(3, 'matching.csv')
    await seedRun(6, 'old-a.csv', encryptedFor)
    await seedRun(9, null)
    await seedRun(12, 'old-b.csv', encryptedFor)

    const priorRuns = await priorCodeRunsForStudy(study.id, latest.id)
    renderWithProviders(<DecryptAndViewOutputs job={latest} priorRuns={priorRuns} isVisible />)
    await screen.findByRole('button', { name: 'View files' })
    return { oldKey }
}

const rowCaret = (row: HTMLElement) => within(row).getByRole('button', { name: /^Code run •/ })

const expandRow = async (row: HTMLElement) => {
    await userEvent.click(rowCaret(row))
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
        expect(within(oldA).getByText(WRONG_KEY_ALERT)).toBeVisible()
        expect(within(oldA).getByPlaceholderText('Enter your security key')).toBeVisible()
        expect(within(oldA).queryByText('old-a.csv')).toBeNull()
        expect(within(oldA).getByText('feedback for old-a.csv')).toBeVisible()
        expect(within(empty).getByText('This run produced no output files.')).toBeVisible()
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

    it('keeps unsubmitted key text through View less and Hide, in memory only', async () => {
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
    })
})

describe('CodeRunHistory row scrolling', () => {
    const placeHeader = (top: number, height = 40) => {
        const header = caret('Mar 05, 2026').parentElement!
        header.getBoundingClientRect = () => ({ top, bottom: top + height }) as DOMRect
    }

    const setup = async ({ reducedMotion = false } = {}) => {
        vi.spyOn(window, 'matchMedia').mockImplementation(
            (query) =>
                ({
                    matches: reducedMotion && query.includes('prefers-reduced-motion'),
                    media: query,
                    addEventListener: () => {},
                    removeEventListener: () => {},
                }) as unknown as MediaQueryList,
        )
        const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
        window.innerHeight = 800
        renderWithProviders(<CodeRunHistory runs={RUNS} />)
        await openHistory()
        return scrollBy
    }

    it('does not scroll when the opened row fits', async () => {
        const scrollBy = await setup()
        placeHeader(100)

        await userEvent.click(caret('Mar 05, 2026'))

        expect(scrollBy).not.toHaveBeenCalled()
    })

    it('scrolls just enough to show the header and the start of the content', async () => {
        const scrollBy = await setup()
        placeHeader(700)

        await userEvent.click(caret('Mar 05, 2026'))

        expect(scrollBy).toHaveBeenCalledWith({ top: 100, behavior: 'smooth' })
    })

    it('never scrolls the header out of view to show more content', async () => {
        const scrollBy = await setup()
        placeHeader(50, 740)

        await userEvent.click(caret('Mar 05, 2026'))

        expect(scrollBy).toHaveBeenCalledWith({ top: 50, behavior: 'smooth' })
    })

    it('scrolls back to a header above the viewport when the row collapses', async () => {
        const scrollBy = await setup()
        placeHeader(100)
        await userEvent.click(caret('Mar 05, 2026'))
        placeHeader(-60)

        await userEvent.click(caret('Mar 05, 2026'))

        expect(scrollBy).toHaveBeenCalledWith({ top: -60, behavior: 'smooth' })
    })

    it('jumps instead of animating when reduced motion is preferred', async () => {
        const scrollBy = await setup({ reducedMotion: true })
        placeHeader(700)

        await userEvent.click(caret('Mar 05, 2026'))

        expect(scrollBy).toHaveBeenCalledWith({ top: 100, behavior: 'auto' })
    })
})
