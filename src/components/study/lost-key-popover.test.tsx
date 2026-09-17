import { describe, expect, it, renderWithProviders, screen, waitFor } from '@/tests/unit.helpers'
import { fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LostKeyPopover } from './lost-key-popover'

const trigger = () => screen.getByRole('button', { name: /lost your key/i })

const isOpen = () => trigger().getAttribute('aria-expanded') === 'true'

describe('LostKeyPopover', () => {
    it('renders the trigger text and icon', () => {
        renderWithProviders(<LostKeyPopover />)
        expect(screen.getByText('Lost your key?')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /lost your key/i })).toBeInTheDocument()
    })

    it('opens the popover on click and shows the help text', async () => {
        renderWithProviders(<LostKeyPopover />)
        await userEvent.click(screen.getByRole('button', { name: /lost your key/i }))

        expect(screen.getByText(/another member of your organization/i)).toBeInTheDocument()
        expect(screen.getByText(/a key you generate now cannot access/i)).toBeInTheDocument()
    })

    it('opens the popover with Enter key', async () => {
        renderWithProviders(<LostKeyPopover />)
        const trigger = screen.getByRole('button', { name: /lost your key/i })
        trigger.focus()

        await userEvent.keyboard('{Enter}')
        expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    it('opens the popover with Space key', async () => {
        renderWithProviders(<LostKeyPopover />)
        const trigger = screen.getByRole('button', { name: /lost your key/i })
        trigger.focus()

        await userEvent.keyboard(' ')
        expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })

    it('dismisses the popover on Escape and returns focus to trigger', async () => {
        renderWithProviders(<LostKeyPopover />)
        const trigger = screen.getByRole('button', { name: /lost your key/i })

        await userEvent.click(trigger)
        expect(trigger).toHaveAttribute('aria-expanded', 'true')

        await userEvent.keyboard('{Escape}')
        expect(trigger).toHaveAttribute('aria-expanded', 'false')
        expect(trigger).toHaveFocus()
    })

    it('dismisses the popover on outside click', async () => {
        renderWithProviders(<LostKeyPopover />)
        const trigger = screen.getByRole('button', { name: /lost your key/i })

        await userEvent.click(trigger)
        expect(trigger).toHaveAttribute('aria-expanded', 'true')

        fireEvent.mouseDown(document.body)
        expect(trigger).toHaveAttribute('aria-expanded', 'false')
    })

    it('includes a link that opens in a new tab with accessible label', async () => {
        renderWithProviders(<LostKeyPopover />)
        await userEvent.click(screen.getByRole('button', { name: /lost your key/i }))

        const link = screen.getByRole('link', { name: /manage your security key/i, hidden: true })
        expect(link).toHaveAttribute('href', '/user-key')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link).toHaveAttribute('aria-label', 'Manage your security key (opens in a new tab)')
    })

    it('opens the popover when the info icon is hovered', async () => {
        renderWithProviders(<LostKeyPopover />)

        await userEvent.hover(trigger())

        await waitFor(() => expect(isOpen()).toBe(true))
        expect(screen.getByText(/another member of your organization/i)).toBeInTheDocument()
    })

    it('closes again once the pointer leaves without a click', async () => {
        renderWithProviders(<LostKeyPopover />)

        await userEvent.hover(trigger())
        await waitFor(() => expect(isOpen()).toBe(true))

        await userEvent.unhover(trigger())

        await waitFor(() => expect(isOpen()).toBe(false))
    })

    it('stays open while the pointer moves from the icon into the card', async () => {
        renderWithProviders(<LostKeyPopover />)

        await userEvent.hover(trigger())
        await waitFor(() => expect(isOpen()).toBe(true))

        // The card holds a link, so the pointer has to be able to travel into it and stay there.
        const link = screen.getByRole('link', { name: /manage your security key/i, hidden: true })
        await userEvent.unhover(trigger())
        await userEvent.hover(link)

        await new Promise((resolve) => setTimeout(resolve, 250))
        expect(isOpen()).toBe(true)
    })

    it('opens the popover when the trigger takes focus', async () => {
        renderWithProviders(<LostKeyPopover />)

        trigger().focus()

        await waitFor(() => expect(isOpen()).toBe(true))
    })

    it('keeps a clicked popover open after the pointer leaves', async () => {
        renderWithProviders(<LostKeyPopover />)

        await userEvent.click(trigger())
        await waitFor(() => expect(isOpen()).toBe(true))

        await userEvent.unhover(trigger())

        await new Promise((resolve) => setTimeout(resolve, 250))
        expect(isOpen()).toBe(true)
    })

    it('closes a hover-opened popover when focus moves away', async () => {
        renderWithProviders(<LostKeyPopover />)

        trigger().focus()
        await waitFor(() => expect(isOpen()).toBe(true))

        trigger().blur()

        await waitFor(() => expect(isOpen()).toBe(false))
    })

    it('marks the link with an external-link icon that assistive tech ignores', async () => {
        renderWithProviders(<LostKeyPopover />)
        await userEvent.click(screen.getByRole('button', { name: /lost your key/i }))

        const link = screen.getByRole('link', { name: /manage your security key/i, hidden: true })
        const icon = link.querySelector('svg')
        expect(icon).not.toBeNull()
        // The aria-label already says a new tab opens, so a second announcement would repeat it.
        expect(icon).toHaveAttribute('aria-hidden', 'true')
    })
})
