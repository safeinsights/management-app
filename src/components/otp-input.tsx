import { PinInput } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'

const OtpInput = ({ form }: { form: UseFormReturnType<{ code: string }> }) => {
    return (
        <PinInput
            length={6}
            size="lg"
            type="number"
            value={form.values.code}
            error={Boolean(form.errors.code)}
            placeholder="0"
            data-testid="sms-pin-input"
            aria-label="One time code"
            oneTimeCode
        />
    )
}

export default OtpInput
