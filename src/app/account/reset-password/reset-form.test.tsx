import { clerkApiError, mockSignIn, renderWithProviders, screen, userEvent, waitFor } from '@/tests/unit.helpers'
import { describe, expect, it, vi } from 'vitest'
import { ResetForm } from './reset-form'

const submitEmail = async (email: string) => {
    await userEvent.type(screen.getByLabelText('Email'), email)
    await userEvent.click(screen.getByRole('button', { name: /send verification code/i }))
}

describe('ResetForm', () => {
    it('starts a reset and sends the email code', async () => {
        const signIn = mockSignIn()
        const onCompleteAction = vi.fn()
        renderWithProviders(<ResetForm onCompleteAction={onCompleteAction} />)

        await submitEmail('ada@example.com')

        await waitFor(() => expect(onCompleteAction).toHaveBeenCalledWith('ada@example.com'))
        expect(signIn.create).toHaveBeenCalledWith({ identifier: 'ada@example.com' })
        expect(signIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledOnce()
    })

    // The screen must not confirm whether an address is registered.
    it('moves on without an error when Clerk cannot find the account', async () => {
        const signIn = mockSignIn({
            create: vi
                .fn()
                .mockResolvedValue(clerkApiError('form_identifier_not_found', "Couldn't find your account.")),
        })
        const onCompleteAction = vi.fn()
        renderWithProviders(<ResetForm onCompleteAction={onCompleteAction} />)

        await submitEmail('nobody@example.com')

        await waitFor(() => expect(onCompleteAction).toHaveBeenCalledWith(null))
        expect(signIn.resetPasswordEmailCode.sendCode).not.toHaveBeenCalled()
        expect(screen.queryByText(/find your account/i)).not.toBeInTheDocument()
    })
})
