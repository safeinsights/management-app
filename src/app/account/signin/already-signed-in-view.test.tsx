import { renderWithProviders, screen, fireEvent } from '@/tests/unit.helpers'
import { describe, it, expect, vi } from 'vitest'
import { AlreadySignedInView } from './already-signed-in-view'

describe('AlreadySignedInView', () => {
    it('shows the signed-in email and both actions', () => {
        renderWithProviders(
            <AlreadySignedInView
                email="ada@example.com"
                isSwitching={false}
                onContinue={vi.fn()}
                onSwitchAccount={vi.fn()}
            />,
        )

        expect(screen.getByRole('heading', { name: /already signed in/i })).toBeInTheDocument()
        expect(screen.getByText(/ada@example\.com/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^continue$/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /different account/i })).toBeInTheDocument()
    })

    it('calls onContinue when Continue is clicked', () => {
        const onContinue = vi.fn()
        renderWithProviders(
            <AlreadySignedInView email={null} isSwitching={false} onContinue={onContinue} onSwitchAccount={vi.fn()} />,
        )

        fireEvent.click(screen.getByRole('button', { name: /^continue$/i }))

        expect(onContinue).toHaveBeenCalledOnce()
    })

    it('calls onSwitchAccount when the switch button is clicked', () => {
        const onSwitchAccount = vi.fn()
        renderWithProviders(
            <AlreadySignedInView
                email={null}
                isSwitching={false}
                onContinue={vi.fn()}
                onSwitchAccount={onSwitchAccount}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: /different account/i }))

        expect(onSwitchAccount).toHaveBeenCalledOnce()
    })

    it('disables Continue while a sign-out is in progress', () => {
        renderWithProviders(
            <AlreadySignedInView email={null} isSwitching={true} onContinue={vi.fn()} onSwitchAccount={vi.fn()} />,
        )

        expect(screen.getByRole('button', { name: /^continue$/i })).toBeDisabled()
    })
})
