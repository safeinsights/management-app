'use client'

import { Paper, Stack } from '@mantine/core'
import { FC } from 'react'
import { FormSectionHeader } from '@/components/study/form-section-header'
import { LostKeyPopover } from '@/components/study/lost-key-popover'
import { SecurityKeyInput } from '@/components/study/security-key-input'
import { SecurityKeyViewButton } from '@/components/study/security-key-view-button'
import { useSecurityKeyForm } from '@/components/study/use-security-key-form'
import type { JobFileInfo } from '@/lib/types'

interface SecurityKeyFormProps {
    job: { id: string }
    type: 'researcher' | 'reviewer'
    onDecrypted: (files: JobFileInfo[]) => void
}

export const SecurityKeyForm: FC<SecurityKeyFormProps> = ({ job, type, onDecrypted }) => {
    const { value, setValue, error, isDecrypting, isLoadingFiles, inputRef, handleSubmit } = useSecurityKeyForm({
        job,
        type,
        onDecrypted,
    })

    return (
        <Paper p="xxl" data-testid="security-key-form">
            <Stack gap="lg">
                <FormSectionHeader
                    title="Security key"
                    description="This key is required to access the outputs. It was issued to you during sign-up."
                    required
                />
                <SecurityKeyInput
                    ref={inputRef}
                    autoFocus
                    placeholder="Enter your security key"
                    value={value}
                    onChange={(event) => setValue(event.currentTarget.value)}
                    error={error}
                    disabled={isDecrypting}
                />
                <SecurityKeyViewButton isDecrypting={isDecrypting} isLoading={isLoadingFiles} onClick={handleSubmit} />
                <LostKeyPopover />
            </Stack>
        </Paper>
    )
}
