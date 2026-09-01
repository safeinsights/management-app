'use client'

import { PinInput } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { revalidateOnBlur, useWidgetBlur } from '@/components/form-field'

const CODE_LENGTH = 6

// `PinInput`'s six inputs blur as the user moves between digits, so validation waits for focus to
// leave the group (OTTER-647). `withAria: false` stops `Input` overwriting `aria-describedby`.
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
                    // Mantine labels every digit "PinInput", which says nothing about position.
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
