'use client'

import { Paper, Stack } from '@mantine/core'
import { FC } from 'react'
import { FormSectionHeader } from '@/components/study/form-section-header'
import { LostKeyPopover } from '@/components/study/lost-key-popover'
import { SecurityKeyInput } from '@/components/study/security-key-input'
import { SecurityKeyViewButton } from '@/components/study/security-key-view-button'
import { useSecurityKeyForm } from '@/components/study/use-security-key-form'
import type { JobFileInfo } from '@/lib/types'

const DEFAULT_TITLE = 'Security key'
const DEFAULT_DESCRIPTION = 'This key is required to access the outputs. It was issued to you during sign-up.'

interface SecurityKeyFormProps {
    /** Only the id is read; see useSecurityKeyForm. */
    job: { id: string }
    /** Which role's key set to decrypt against; see useSecurityKeyForm. */
    type: 'researcher' | 'reviewer'
    /** Fires once the key decrypts the job's artifacts; the caller swaps in the review view. */
    onDecrypted: (files: JobFileInfo[]) => void
    title?: string
    description?: string
}

export const SecurityKeyForm: FC<SecurityKeyFormProps> = ({
    job,
    type,
    onDecrypted,
    title = DEFAULT_TITLE,
    description = DEFAULT_DESCRIPTION,
}) => {
    const { value, setValue, error, isDecrypting, isLoadingFiles, inputRef, handleSubmit } = useSecurityKeyForm({
        job,
        type,
        onDecrypted,
    })

    return (
        <Paper p="xxl" data-testid="security-key-form">
            <Stack gap={24}>
                <FormSectionHeader title={title} description={description} required />
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
