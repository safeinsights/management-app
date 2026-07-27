import { PinInput } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { revalidateOnBlur, widgetBlurHandler } from '@/components/form-field'

/**
 * `PinInput` renders six sibling inputs, so blur fires as the user moves between digits. The
 * handler is guarded to run once focus leaves the whole group, otherwise a partially typed
 * code errors mid-entry (OTTER-647).
 *
 * ARIA goes through `getInputProps`, which Mantine spreads onto each digit input; props on
 * `PinInput` itself land on the wrapping group, where assistive tech never reads them.
 */
const OtpInput = ({ form, errorId }: { form: UseFormReturnType<{ code: string }>; errorId?: string }) => {
    const hasError = Boolean(form.errors.code)

    return (
        <div onBlur={widgetBlurHandler(revalidateOnBlur(form, 'code'))}>
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
                getInputProps={() => ({
                    'aria-invalid': hasError || undefined,
                    'aria-describedby': hasError ? errorId : undefined,
                })}
                oneTimeCode
            />
        </div>
    )
}

export default OtpInput
