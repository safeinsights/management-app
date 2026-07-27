import { PinInput } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { widgetBlurHandler } from '@/components/form-field'

/**
 * `PinInput` renders six sibling inputs, so blur fires as the user moves between digits.
 * The handler is guarded to run once focus leaves the whole group, otherwise a partially
 * typed code errors mid-entry (OTTER-647). Callers render the error message themselves.
 */
const OtpInput = ({ form }: { form: UseFormReturnType<{ code: string }> }) => {
    const hasError = Boolean(form.errors.code)

    return (
        <div onBlur={widgetBlurHandler(() => form.validateField('code'))}>
            <PinInput
                autoFocus
                length={6}
                size="lg"
                type="number"
                onChange={(value) => form.setFieldValue('code', value)}
                error={hasError}
                placeholder="0"
                data-testid="sms-pin-input"
                aria-label="One time code"
                aria-invalid={hasError || undefined}
                aria-describedby={hasError ? 'otp-code-error' : undefined}
                oneTimeCode
            />
        </div>
    )
}

export default OtpInput
