import { useForm } from '@/common'
import { describe, expect, it, renderWithProviders, screen, userEvent, vi } from '@/tests/unit.helpers'
import { AddSmsOtpView, type OtpFormValues } from './add-sms-mfa-view'

const OtpStep = ({ onSubmit, onResend }: { onSubmit: () => void; onResend: () => void }) => {
    const form = useForm<OtpFormValues>({ initialValues: { code: '123456' } })
    return (
        <AddSmsOtpView
            isVisible
            form={form}
            onSubmit={onSubmit}
            onResend={onResend}
            isVerifyingCode={false}
            phoneLastFour="0123"
        />
    )
}

describe('AddSmsOtpView', () => {
    it('resends the code without submitting the entered code', async () => {
        const user = userEvent.setup()
        const onSubmit = vi.fn()
        const onResend = vi.fn()
        renderWithProviders(<OtpStep onSubmit={onSubmit} onResend={onResend} />)

        await user.click(screen.getByRole('button', { name: 'Resend code' }))

        expect(onResend).toHaveBeenCalledTimes(1)
        expect(onSubmit).not.toHaveBeenCalled()
    })
})
