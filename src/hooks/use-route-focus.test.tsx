import { useState, type ReactNode } from 'react'
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
} from '@/tests/unit.helpers'
import { AppModal } from '@/components/modals/app-modal'
import { RouteFocusManager } from '@/components/layout/route-focus-manager'
import { MAIN_CONTENT_PROPS } from '@/lib/constants'
import { Routes } from '@/lib/routes'

const STUDY = { orgSlug: 'lab', studyId: BLANK_UUID }
const SETUP = Routes.studyEdit(STUDY)
const PROPOSAL = Routes.studyProposal(STUDY)
const MFA = Routes.accountMfaApp

// Lives in the shell, like the legal-acknowledgement modal, so it outlasts a route change.
function ShellModal() {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <>
            <button onClick={() => setIsOpen(true)}>Review terms</button>
            <AppModal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Terms of use">
                <button>Accept</button>
            </AppModal>
        </>
    )
}

const PAGES: Record<string, ReactNode> = {
    [SETUP]: <button>Next step</button>,
    [PROPOSAL]: <button>Previous step</button>,
    [MFA]: <input aria-label="Verification code" autoFocus />,
}

// Keyed like a Next segment, so the old page's controls unmount when the route changes.
function CurrentPage() {
    const pathname = usePathname()

    return <div key={pathname}>{PAGES[pathname]}</div>
}

// The manager sits outside the shell, as it does in the root layout.
function App() {
    return (
        <>
            <RouteFocusManager />
            <nav>
                <a href="#dashboard">Dashboard</a>
                <ShellModal />
            </nav>
            <main {...MAIN_CONTENT_PROPS}>
                <CurrentPage />
            </main>
        </>
    )
}

const navigate = (url: string) => act(() => mockRouter.push(url))

const main = () => screen.getByRole('main')

describe('useRouteFocus', () => {
    beforeEach(() => mockPathname(SETUP))

    it('leaves focus alone on the first load', () => {
        renderWithProviders(<App />)

        expect(main()).not.toHaveFocus()
    })

    it('moves focus off a navbar link and onto main when the route changes', async () => {
        renderWithProviders(<App />)
        screen.getByRole('link', { name: 'Dashboard' }).focus()

        await navigate(PROPOSAL)

        expect(main()).toHaveFocus()
    })

    it('moves focus to main going forward and again coming back', async () => {
        renderWithProviders(<App />)

        screen.getByRole('button', { name: 'Next step' }).focus()
        await navigate(PROPOSAL)
        expect(main()).toHaveFocus()

        screen.getByRole('button', { name: 'Previous step' }).focus()
        await navigate(SETUP)
        expect(main()).toHaveFocus()
    })

    it('ignores a change to the query string alone', async () => {
        renderWithProviders(<App />)
        const link = screen.getByRole('link', { name: 'Dashboard' })
        link.focus()

        await navigate(Routes.studyEdit({ ...STUDY, returnTo: 'org' }))

        expect(link).toHaveFocus()
    })

    it('ignores a modal opening on the same page', async () => {
        renderWithProviders(<App />)

        await userEvent.click(screen.getByRole('button', { name: 'Review terms' }))
        await screen.findByRole('dialog')

        expect(main()).not.toHaveFocus()
    })

    it('keeps focus on a field the new page autofocused', async () => {
        renderWithProviders(<App />)

        await navigate(MFA)

        expect(screen.getByLabelText('Verification code')).toHaveFocus()
    })

    it('keeps focus inside a modal that is open when the route changes', async () => {
        renderWithProviders(<App />)
        await userEvent.click(screen.getByRole('button', { name: 'Review terms' }))
        const accept = await screen.findByRole('button', { name: 'Accept' })
        accept.focus()

        await navigate(PROPOSAL)

        expect(accept).toHaveFocus()
    })
})
