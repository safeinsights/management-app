import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LostKeyPopover } from './lost-key-popover'

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
})
