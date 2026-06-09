import type { Story } from '@ladle/react'
import { useForm } from '@mantine/form'
import OtpInput from './otp-input'

// Six-digit one-time-code PinInput driven by a real Mantine form. The error
// state is keyed off form.errors.code, so each story builds its own form and
// the error variant seeds an initial error.
const meta = { title: 'Forms / OtpInput' }
export default meta

export const Default: Story = () => {
    const form = useForm({ initialValues: { code: '' } })
    return (
        <div style={{ padding: 24, maxWidth: 640 }}>
            <OtpInput form={form} />
        </div>
    )
}

export const WithError: Story = () => {
    const form = useForm({
        initialValues: { code: '' },
        initialErrors: { code: 'Invalid code' },
    })
    return (
        <div style={{ padding: 24, maxWidth: 640 }}>
            <OtpInput form={form} />
        </div>
    )
}
