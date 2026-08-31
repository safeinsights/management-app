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
    const { value, setValue, error, isDecrypting, isLoadingFiles, inputRef, handleSubmit, hasNoDecryptableFiles } =
        useSecurityKeyForm({
            job,
            type,
            onDecrypted,
        })

    if (type === 'researcher' && hasNoDecryptableFiles) {
        return <NoAccessibleOutputsNotice />
    }

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

/**
 * Shown to a researcher who holds no wrapped key for the job (OTTER-688), instead of a form no key of
 * theirs can satisfy. Keys are re-wrapped per recipient at the moment the reviewer shares, so this is
 * whoever was not in that set: no registered key, a rotated one (rotation replaces the row, orphaning
 * the old fingerprint), or a lab member who joined afterwards.
 *
 * Not blank, unlike encrypted-files-panel's older take on the same state: this screen's banner has
 * already told the researcher the outputs are available, so silence reads as a broken page. It also
 * must not be the form's "No encrypted outputs available to decrypt" error, which describes the Data
 * Partner withholding outputs they in fact shared.
 *
 * Deliberately makes no claim about the cause, so it stays true for a job that carries no artifacts at
 * all (the legacy approve action, QA and e2e seeds). Actually restoring access is the separate
 * renewal re-wrap flow — see the follow-up documented in server/results-sharing.ts.
 */
const NoAccessibleOutputsNotice: FC = () => (
    <Paper p="xxl" data-testid="security-key-no-access">
        <Stack gap={24}>
            <FormSectionHeader
                title="Your security key cannot open these outputs"
                description="These outputs were encrypted for a different security key. Ask an organization administrator to re-share them with your current key."
            />
        </Stack>
    </Paper>
)
