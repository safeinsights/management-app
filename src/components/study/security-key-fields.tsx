'use client'

import { FC } from 'react'
import { LostKeyPopover } from '@/components/study/lost-key-popover'
import { SecurityKeyInput } from '@/components/study/security-key-input'
import { SecurityKeyViewButton } from '@/components/study/security-key-view-button'
import { useSecurityKeyForm } from '@/components/study/use-security-key-form'
import type { JobFileInfo } from '@/lib/types'

interface SecurityKeyFieldsProps {
    job: { id: string }
    type: 'researcher' | 'reviewer'
    onDecrypted: (files: JobFileInfo[]) => void
    onKeyAccepted?: (privateKey: string) => void
    buttonLabel?: string
    autoFocus?: boolean
    withLostKeyHelp?: boolean
}

// The key entry shared by every key card; each card renders its own header above it.
export const SecurityKeyFields: FC<SecurityKeyFieldsProps> = ({
    job,
    type,
    onDecrypted,
    onKeyAccepted,
    buttonLabel,
    autoFocus = true,
    withLostKeyHelp = true,
}) => {
    const { value, setValue, error, isDecrypting, isLoadingFiles, inputRef, handleSubmit } = useSecurityKeyForm({
        job,
        type,
        onDecrypted,
        onKeyAccepted,
    })

    return (
        <>
            <SecurityKeyInput
                ref={inputRef}
                autoFocus={autoFocus}
                placeholder="Enter your security key"
                value={value}
                onChange={(event) => setValue(event.currentTarget.value)}
                error={error}
                disabled={isDecrypting}
            />
            <SecurityKeyViewButton
                isDecrypting={isDecrypting}
                isLoading={isLoadingFiles}
                idleLabel={buttonLabel}
                onClick={handleSubmit}
            />
            <LostKeyPopover isVisible={withLostKeyHelp} />
        </>
    )
}
