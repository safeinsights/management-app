import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { Box } from '@mantine/core'
import { useForm } from '@/common'
import OtpInput from './otp-input'

// Each digit is a Mantine `Input`, which spreads its own aria attributes *after* the caller's and
// sets `aria-describedby` from its `Input.Wrapper` context. `PinInput` renders the digits outside
// any wrapper, so that context is undefined and a hand-passed `aria-describedby` was silently
// overwritten with `undefined`. Asserting per digit, because the first one passing proves nothing
// about the other five.
function Harness({ error }: { error?: string }) {
    // `initialErrors` rather than assigning to `form.errors`, which Mantine exposes as read-only.
    // Stands in for the server rejection that installs this message via `setFieldError`.
    const form = useForm<{ code: string }>({
        initialValues: { code: '' },
        initialErrors: error ? { code: error } : {},
    })

    return (
        <>
            <Box id="probe-otp-error">{error}</Box>
            <OtpInput form={form} errorId="probe-otp-error" />
        </>
    )
}

const digits = () => screen.getAllByRole('textbox')

describe('OtpInput', () => {
    it('gives every digit a positional accessible name', () => {
        renderWithProviders(<Harness />)

        const names = digits().map((d) => d.getAttribute('aria-label'))
        expect(names).toEqual([
            'Digit 1 of 6',
            'Digit 2 of 6',
            'Digit 3 of 6',
            'Digit 4 of 6',
            'Digit 5 of 6',
            'Digit 6 of 6',
        ])
    })

    it('points every digit at the error message, not just the first', () => {
        renderWithProviders(<Harness error="Incorrect code, please try again." />)

        for (const digit of digits()) {
            expect(digit).toHaveAttribute('aria-describedby', 'probe-otp-error')
            expect(digit).toHaveAttribute('aria-invalid', 'true')
        }
        expect(document.getElementById('probe-otp-error')).toHaveTextContent('Incorrect code, please try again.')
    })

    it('describes no digit while there is no error', () => {
        renderWithProviders(<Harness />)

        for (const digit of digits()) {
            expect(digit).not.toHaveAttribute('aria-describedby')
        }
    })
})
