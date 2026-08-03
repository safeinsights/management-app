'use client'

import { Paper, Stack, Text } from '@mantine/core'
import { FC } from 'react'
import { FormSectionHeader } from '@/components/study/form-section-header'
import { LostKeyPopover } from '@/components/study/lost-key-popover'
import { SecurityKeyInput } from '@/components/study/security-key-input'
import { SecurityKeyViewButton } from '@/components/study/security-key-view-button'
import { useSecurityKeyForm } from '@/components/study/use-security-key-form'
import type { LatestJobForStudy } from '@/server/db/queries'

interface SecurityKeyFormProps {
    job: LatestJobForStudy
}

export const SecurityKeyForm: FC<SecurityKeyFormProps> = ({ job }) => {
    const { value, setValue, error, successMessage, isDecrypting, inputRef, handleSubmit } = useSecurityKeyForm({ job })

    return (
        <Paper p="xxl">
            <Stack gap={24}>
                <FormSectionHeader
                    title="Security key"
                    description="This key is required to access the outputs. It was issued to you during sign-up."
                    required
                />
                <SecurityKeyInput
                    ref={inputRef}
                    value={value}
                    onChange={(event) => setValue(event.currentTarget.value)}
                    error={error}
                    disabled={isDecrypting}
                />
                <SecurityKeyViewButton isDecrypting={isDecrypting} onClick={handleSubmit} />
                <SuccessMessage message={successMessage} />
                <LostKeyPopover />
            </Stack>
        </Paper>
    )
}

// TODO: remove this after 675 is implemented. this is temporary for testing.
const SuccessMessage: FC<{ message?: string }> = ({ message }) => {
    if (!message) return null
    return (
        <Text fz="md" c="green.9">
            {message}
        </Text>
    )
}
