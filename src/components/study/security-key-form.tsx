'use client'

import { Paper, Stack } from '@mantine/core'
import { FC } from 'react'
import { FormSectionHeader } from '@/components/study/form-section-header'
import { LostKeyPopover } from '@/components/study/lost-key-popover'
import { SecurityKeyInput } from '@/components/study/security-key-input'
import { SecurityKeyViewButton } from '@/components/study/security-key-view-button'
import { useSecurityKeyForm } from '@/components/study/use-security-key-form'
import type { JobFileInfo } from '@/lib/types'
import type { LatestJobForStudy } from '@/server/db/queries'

interface SecurityKeyFormProps {
    job: LatestJobForStudy
    /** Which role's key set to decrypt against; see useSecurityKeyForm. */
    type: 'researcher' | 'reviewer'
    /** Fires once the key decrypts the job's artifacts; the caller swaps in the review view. */
    onDecrypted: (files: JobFileInfo[]) => void
}

export const SecurityKeyForm: FC<SecurityKeyFormProps> = ({ job, type, onDecrypted }) => {
    const { value, setValue, error, isDecrypting, isLoadingFiles, inputRef, handleSubmit } = useSecurityKeyForm({
        job,
        type,
        onDecrypted,
    })

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
