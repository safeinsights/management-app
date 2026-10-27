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
    vi,
    waitFor,
} from '@/tests/unit.helpers'
import { RouteAnnouncer } from '@/components/layout/route-announcer'
import { Routes } from '@/lib/routes'

const STUDY = { orgSlug: 'lab', studyId: BLANK_UUID }
const SETUP = Routes.studyEdit(STUDY)
const SETUP_OTHER = Routes.studyEdit({ ...STUDY, studyId: '11111111-1111-4111-8111-111111111111' })
const CODE = Routes.studyCode(STUDY)
const PROPOSAL = Routes.studyProposal(STUDY)
const MFA = Routes.accountMfaApp
const NOT_FOUND = Routes.notFound

// Each page's titles in the order its head commits them; '' is a head with no title yet.
const TITLES: Record<string, string[]> = {
    [SETUP]: ['Set up study - SafeInsights'],
    [SETUP_OTHER]: ['Set up study - SafeInsights'],
    [CODE]: ['Study code - SafeInsights'],
    [PROPOSAL]: ['', 'Study proposal - SafeInsights', 'Something went wrong - SafeInsights'],
    [MFA]: [''],
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

// Every value the region held, so a wrong announcement that was later replaced still fails.
function recordAnnouncements(): string[] {
    const history: string[] = []
    const node = region()
    new MutationObserver(() => {
        if (node.textContent) history.push(node.textContent)
    }).observe(node, { childList: true, subtree: true, characterData: true })
    return history
}

const releaseTitle = () => userEvent.click(screen.getByRole('button', { name: 'Next title' }))

describe('useRouteAnnouncement', () => {
    beforeEach(() => mockPathname(SETUP))

    it('says nothing on the first load', () => {
        renderWithProviders(<App />)

        expect(region()).toHaveTextContent('')
    })

    it('waits for a title that commits after the page, instead of reading the heading', async () => {
        renderWithProviders(<App />)
        const history = recordAnnouncements()

        await navigate(PROPOSAL)
        expect(region()).toHaveTextContent('')

        await releaseTitle()

        await waitFor(() => expect(history).toEqual(['Study proposal - SafeInsights']))
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

        expect(history).toEqual([])
        expect(region()).toHaveTextContent('')
    })

    it('disconnects a pending wait when the route changes again, and on unmount', async () => {
        const observe = vi.spyOn(MutationObserver.prototype, 'observe')
        const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
        const { unmount } = renderWithProviders(<App />)

        await navigate(MFA)
        await navigate(PROPOSAL)
        unmount()

        const headObservers = observe.mock.contexts.filter((_, i) => observe.mock.calls[i][0] === document.head)
        expect(headObservers).toHaveLength(2)
        for (const observer of headObservers) expect(disconnect.mock.contexts).toContain(observer)
    })

    it('announces again going forward and coming back', async () => {
        renderWithProviders(<App />)
        const history = recordAnnouncements()

        await navigate(CODE)
        await navigate(SETUP)

        await waitFor(() => expect(history).toEqual(['Study code - SafeInsights', 'Set up study - SafeInsights']))
    })

    it('does not announce a title left over from the last page, even when other head tags change', async () => {
        renderWithProviders(<App leftover="Set up study - SafeInsights" />)
        const history = recordAnnouncements()

        await navigate(PROPOSAL)
        // Styles land in the head during a navigation too; only a <title> change is an arrival.
        await act(async () => document.head.append(document.createElement('style')))
        expect(history).toEqual([])

        await releaseTitle()

        await waitFor(() => expect(history).toEqual(['Study proposal - SafeInsights']))
    })

    it('skips the bare default and waits for the page to name itself', async () => {
        renderWithProviders(<App />)
        const history = recordAnnouncements()

        await navigate(NOT_FOUND)
        expect(history).toEqual([])

        await releaseTitle()

        await waitFor(() => expect(history).toEqual(['Page not found - SafeInsights']))
    })

    it('announces a page that retitles itself after it arrived, as the error screen does', async () => {
        renderWithProviders(<App />)
        const history = recordAnnouncements()

        await navigate(PROPOSAL)
        await releaseTitle()
        await releaseTitle()

        await waitFor(() =>
            expect(history).toEqual(['Study proposal - SafeInsights', 'Something went wrong - SafeInsights']),
        )
    })

    it('stays silent when the next page has the same title', async () => {
        renderWithProviders(<App />)
        const history = recordAnnouncements()

        await navigate(SETUP_OTHER)

        expect(history).toEqual([])
    })
})
