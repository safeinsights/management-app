import { useState } from 'react'
import { usePathname } from 'next/navigation'
import mockRouter from 'next-router-mock'
import {
    act,
    beforeEach,
    BLANK_UUID,
    describe,
    expect,
    it,
    mockPathname,
    renderWithProviders,
    screen,
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import { RouteAnnouncer } from '@/components/layout/route-announcer'
import { ANNOUNCEMENT_DELAY_MS } from '@/hooks/use-route-announcement'
import { Routes } from '@/lib/routes'

const STUDY = { orgSlug: 'lab', studyId: BLANK_UUID }
const SETUP = Routes.studyEdit(STUDY)
const SETUP_OTHER = Routes.studyEdit({ ...STUDY, studyId: '11111111-1111-4111-8111-111111111111' })
const CODE = Routes.studyCode(STUDY)
const PROPOSAL = Routes.studyProposal(STUDY)
const NOT_FOUND = Routes.notFound

// Each page's titles in the order its head commits them; '' is a head with no title yet.
const TITLES: Record<string, string[]> = {
    [SETUP]: ['Set up study - SafeInsights'],
    [SETUP_OTHER]: ['', 'Set up study - SafeInsights'],
    [CODE]: ['Study code - SafeInsights'],
    [PROPOSAL]: ['', 'Study proposal - SafeInsights', 'Something went wrong - SafeInsights'],
    [NOT_FOUND]: ['SafeInsights', 'Page not found - SafeInsights'],
}

// React hoists the <title> into document.head, as Next's metadata does. The button releases the
// next one, so a test can hold the page in the gap where Next has not committed it yet.
function StudyPage({ titles }: { titles: string[] }) {
    const [step, setStep] = useState(0)
    const title = titles[step]

    return (
        <>
            {title ? <title>{title}</title> : null}
            <h1>A study title</h1>
            <button onClick={() => setStep(step + 1)}>Next title</button>
        </>
    )
}

// Keyed like a Next segment, so the old page's title unmounts when the route changes.
function CurrentPage() {
    const pathname = usePathname()

    return <StudyPage key={pathname} titles={TITLES[pathname] ?? []} />
}

// The announcer sits outside the page, as it does in the root layout. `leftover` is a title that
// outlives a navigation, like one the error screen's DOM setter creates.
function App({ leftover }: { leftover?: string }) {
    return (
        <>
            {leftover ? <title>{leftover}</title> : null}
            <RouteAnnouncer />
            <CurrentPage />
        </>
    )
}

const navigate = (url: string) => act(() => mockRouter.push(url))

const region = () => screen.getByTestId('route-announcer')

// Every value the region held, so a wrong announcement that was later replaced still fails. Trimmed
// of the no-break space that every second announcement ends in.
function recordAnnouncements(): string[] {
    const history: string[] = []
    const node = region()
    new MutationObserver(() => {
        if (node.textContent) history.push(node.textContent.trim())
    }).observe(node, { childList: true, subtree: true, characterData: true })
    return history
}

const releaseTitle = () => userEvent.click(screen.getByRole('button', { name: 'Next title' }))

// An announcement is held back, so silence only counts once the hold is over.
const outlastDelay = () => act(() => new Promise((resolve) => setTimeout(resolve, ANNOUNCEMENT_DELAY_MS + 50)))

describe('useRouteAnnouncement', () => {
    beforeEach(() => mockPathname(SETUP))

    it('says nothing on the first load', async () => {
        renderWithProviders(<App />)
        await outlastDelay()

        expect(region()).toHaveTextContent('')
    })

    it('waits for a title that commits after the page, instead of reading the heading', async () => {
        renderWithProviders(<App />)
        const history = recordAnnouncements()

        await navigate(PROPOSAL)
        await outlastDelay()
        expect(region()).toHaveTextContent('')

        await releaseTitle()

        await waitFor(() => expect(history).toEqual(['Study proposal - SafeInsights']))
    })

    it('holds the title back until the focus move to main has been spoken', async () => {
        renderWithProviders(<App />)
        const history = recordAnnouncements()

        await navigate(CODE)
        expect(history).toEqual([])

        await waitFor(() => expect(history).toEqual(['Study code - SafeInsights']))
    })

    it('announces only the title that stays when another replaces it during the hold', async () => {
        renderWithProviders(<App />)
        const history = recordAnnouncements()

        await navigate(CODE)
        await navigate(PROPOSAL)
        await releaseTitle()

        await waitFor(() => expect(history).toEqual(['Study proposal - SafeInsights']))
        await outlastDelay()
        expect(history).toEqual(['Study proposal - SafeInsights'])
    })

    it('announces a title that is already in place, as on Back and Forward', async () => {
        renderWithProviders(<App />)
        const history = recordAnnouncements()

        await navigate(CODE)

        await waitFor(() => expect(history).toEqual(['Study code - SafeInsights']))
    })

    it('ignores a change to the query string alone', async () => {
        renderWithProviders(<App />)
        const history = recordAnnouncements()

        await navigate(`${SETUP}?tab=details`)
        await outlastDelay()

        expect(history).toEqual([])
        expect(region()).toHaveTextContent('')
    })

    it('announces again going forward and coming back', async () => {
        renderWithProviders(<App />)
        const history = recordAnnouncements()

        await navigate(CODE)
        await waitFor(() => expect(history).toEqual(['Study code - SafeInsights']))
        await navigate(SETUP)

        await waitFor(() => expect(history).toEqual(['Study code - SafeInsights', 'Set up study - SafeInsights']))
    })

    it('swaps in a new text node for each title, which VoiceOver speaks more reliably than an edit', async () => {
        renderWithProviders(<App />)

        await navigate(CODE)
        await waitFor(() => expect(region()).toHaveTextContent('Study code - SafeInsights'))
        const first = region().firstChild
        await navigate(SETUP)
        await waitFor(() => expect(region()).toHaveTextContent('Set up study - SafeInsights'))

        expect(region().firstChild).not.toBe(first)
    })

    it('announces the last page again when a quick Back returns to it during the hold', async () => {
        renderWithProviders(<App />)
        const history = recordAnnouncements()

        await navigate(CODE)
        await waitFor(() => expect(history).toEqual(['Study code - SafeInsights']))
        const first = region().textContent
        await navigate(SETUP)
        await navigate(CODE)

        await waitFor(() => expect(history).toEqual(['Study code - SafeInsights', 'Study code - SafeInsights']))
        // Word for word the same text would go unspoken.
        expect(region().textContent).not.toBe(first)
    })

    it('does not announce a title left over from the last page, even when other head tags change', async () => {
        renderWithProviders(<App leftover="Set up study - SafeInsights" />)
        const history = recordAnnouncements()

        await navigate(PROPOSAL)
        // Styles land in the head during a navigation too; only a <title> change is an arrival.
        await act(async () => document.head.append(document.createElement('style')))
        await outlastDelay()
        expect(history).toEqual([])

        await releaseTitle()

        await waitFor(() => expect(history).toEqual(['Study proposal - SafeInsights']))
    })

    it('skips the bare default and waits for the page to name itself', async () => {
        renderWithProviders(<App />)
        const history = recordAnnouncements()

        await navigate(NOT_FOUND)
        await outlastDelay()
        expect(history).toEqual([])

        await releaseTitle()

        await waitFor(() => expect(history).toEqual(['Page not found - SafeInsights']))
    })

    it('announces a page that retitles itself after it arrived, as the error screen does', async () => {
        renderWithProviders(<App />)
        const history = recordAnnouncements()

        await navigate(PROPOSAL)
        await releaseTitle()
        await waitFor(() => expect(history).toEqual(['Study proposal - SafeInsights']))
        await releaseTitle()

        await waitFor(() =>
            expect(history).toEqual(['Study proposal - SafeInsights', 'Something went wrong - SafeInsights']),
        )
    })

    it('stays silent when the next page has the same title', async () => {
        renderWithProviders(<App />)
        const history = recordAnnouncements()

        await navigate(SETUP_OTHER)
        await releaseTitle()
        await outlastDelay()

        expect(history).toEqual([])
    })
})
