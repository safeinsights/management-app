import { PinInput } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { revalidateOnBlur, useWidgetBlur } from '@/components/form-field'

const CODE_LENGTH = 6

/**
 * `PinInput` renders six sibling inputs, so blur fires as the user moves between digits. The
 * handler is guarded to run once focus leaves the whole group, otherwise a partially typed
 * code errors mid-entry (OTTER-647).
 *
 * ARIA goes through `getInputProps`, which Mantine spreads onto each digit input; props on
 * `PinInput` itself land on the wrapping group, where assistive tech never reads them.
 *
 * `withAria: false` is required for `aria-describedby` to survive. Each digit is an `Input`, and
 * `Input` spreads its own aria attributes *after* the caller's, setting `aria-describedby` from its
 * `Input.Wrapper` context. `PinInput` renders its digits outside any wrapper, so that context is
 * undefined and the caller's value was being overwritten with `undefined`. Turning the block off
 * hands ARIA ownership here, which is why `aria-invalid` is set explicitly below rather than left
 * to Mantine (OTTER-647). Note the digits end up with no `id`: `Input` assigns that inside the
 * same block, and it cannot be supplied through `getInputProps`. Nothing depends on those ids,
 * the e2e specs address the group by its `data-testid`.
 */
const OtpInput = ({ form, errorId }: { form: UseFormReturnType<{ code: string }>; errorId?: string }) => {
    const hasError = Boolean(form.errors.code)
    const widgetBlur = useWidgetBlur(revalidateOnBlur(form, 'code'))

    return (
        <div {...widgetBlur}>
            <PinInput
                autoFocus
                length={CODE_LENGTH}
                size="lg"
                type="number"
                onChange={(value) => form.setFieldValue('code', value)}
                error={hasError}
                placeholder="0"
                data-testid="sms-pin-input"
                aria-label="One time code"
                getInputProps={(index) => ({
                    withAria: false,
                    // Mantine labels every digit "PinInput" by default, which tells a screen reader
                    // nothing about position. The group keeps its own "One time code" name.
                    'aria-label': `Digit ${index + 1} of ${CODE_LENGTH}`,
                    'aria-invalid': hasError || undefined,
                    'aria-describedby': hasError ? errorId : undefined,
                })}
                oneTimeCode
            />
        </div>
    )
}

export default OtpInput
