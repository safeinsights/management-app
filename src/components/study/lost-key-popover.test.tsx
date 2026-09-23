import { act, afterEach, describe, expect, it, renderWithProviders, screen, waitFor } from '@/tests/unit.helpers'
import { vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HOVER_CLOSE_DELAY_MS, LostKeyPopover } from './lost-key-popover'

const trigger = () => screen.getByRole('button', { name: /lost your key/i })

const isOpen = () => trigger().getAttribute('aria-expanded') === 'true'

const keyLink = () => screen.getByRole('link', { name: /manage your security key/i, hidden: true })

const passHoverCloseDelay = () => act(() => vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS + 1))

describe('LostKeyPopover', () => {
    afterEach(() => vi.useRealTimers())

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

        vi.useFakeTimers()
        fireEvent.mouseLeave(trigger())
        fireEvent.mouseEnter(keyLink())
        passHoverCloseDelay()

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

        vi.useFakeTimers()
        fireEvent.mouseLeave(trigger())
        passHoverCloseDelay()

        expect(isOpen()).toBe(true)
    })

    it('closes a focus-opened popover when focus leaves the group entirely', async () => {
        renderWithProviders(<LostKeyPopover />)

        trigger().focus()
        await waitFor(() => expect(isOpen()).toBe(true))

        trigger().blur()

        await waitFor(() => expect(isOpen()).toBe(false))
    })

    // jsdom has no layout, so a real Tab into the card cannot run here. These two cover what makes it work:
    // the card follows the icon in this subtree, and focus moving into it does not count as leaving.
    it('places the card in the group, after the icon, rather than in a portal', async () => {
        renderWithProviders(<LostKeyPopover />)
        await userEvent.click(trigger())

        expect(trigger().closest('[class*="Group-root"]')).toContainElement(keyLink())
        expect(trigger().compareDocumentPosition(keyLink()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('keeps the card open when focus moves from the icon into it', async () => {
        renderWithProviders(<LostKeyPopover />)

        trigger().focus()
        await waitFor(() => expect(isOpen()).toBe(true))

        fireEvent.focusOut(trigger(), { relatedTarget: keyLink() })

        // Opening on focus is only worth anything if the link it reveals survives being focused.
        expect(isOpen()).toBe(true)
    })

    it('dismisses the card on Escape from its link and leaves it closed', async () => {
        renderWithProviders(<LostKeyPopover />)

        await userEvent.click(trigger())
        await waitFor(() => expect(isOpen()).toBe(true))

        keyLink().focus()
        await userEvent.keyboard('{Escape}')

        expect(trigger()).toHaveFocus()
        // Handing focus back must not trip the icon's focus handler and reopen what Escape closed.
        await waitFor(() => expect(isOpen()).toBe(false))
    })

    it('lets Escape reach the surrounding page once the card is closed', async () => {
        const onKeyDown = vi.fn()
        renderWithProviders(
            <div onKeyDown={onKeyDown}>
                <LostKeyPopover />
            </div>,
        )

        trigger().focus()
        await waitFor(() => expect(isOpen()).toBe(true))
        fireEvent.mouseDown(document.body)
        await waitFor(() => expect(isOpen()).toBe(false))

        await userEvent.keyboard('{Escape}')

        // The icon still holds focus, and whatever surrounds this closes on Escape itself.
        expect(onKeyDown).toHaveBeenCalled()
    })

    it('marks the link with an external-link icon that assistive tech ignores', async () => {
        renderWithProviders(<LostKeyPopover />)
        await userEvent.click(screen.getByRole('button', { name: /lost your key/i }))

        const link = screen.getByRole('link', { name: /manage your security key/i, hidden: true })
        const icon = link.querySelector('svg')
        expect(icon).not.toBeNull()
        expect(icon).toHaveAttribute('aria-hidden', 'true')
    })
})
