'use client'

import { useMutation, useQueryClient, useState, type FC } from '@/common'
import { reportMutationError } from '@/components/errors'
import { AppModal } from '@/components/modals/app-modal'
import { uploadFiles } from '@/hooks/upload'
import { actionResult } from '@/lib/utils'
import type { LegalDocumentTypeValue } from '@/schema/legal-document'
import {
    createLegalDocumentDraftAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { Button, Group, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import type { ReactNode } from 'react'
import { formatDayString } from '@/lib/dates'
import { ReadOnlyField } from './read-only-field'

type DraftScope = { type: LegalDocumentTypeValue; orgId?: string; studyId?: string }

type PublishVariables = { scope: DraftScope; signedAt: string; file: File }

// Publish runs last, so a failed upload leaves a replaceable draft rather than a live agreement
// with no file behind it.
const usePublishAgreement = ({
    invalidateKeys,
    onComplete,
}: {
    invalidateKeys: readonly (readonly unknown[])[]
    onComplete: () => void
}) => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ scope, signedAt, file }: PublishVariables) => {
            const { version, upload } = actionResult(
                await createLegalDocumentDraftAction({ ...scope, fileName: file.name }),
            )
            await uploadFiles([[file, upload]])
            return actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt }))
        },
        onError: reportMutationError('Could not publish the agreement'),
        onSuccess: async () => {
            await Promise.all(invalidateKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
            onComplete()
        },
    })
}

export const useAgreementUpload = <Subject,>({
    subject,
    scopeFor,
    invalidateKeys,
    onComplete,
}: {
    subject: Subject | undefined
    scopeFor: (subject: Subject) => DraftScope
    invalidateKeys: readonly (readonly unknown[])[]
    onComplete: () => void
}) => {
    const [signedAt, setSignedAt] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [confirming, { open: askForConfirmation, close: stopConfirming }] = useDisclosure(false)
    const { mutate, isPending, isSuccess } = usePublishAgreement({ invalidateKeys, onComplete })

    const publish = () => {
        if (!subject || !file) return
        mutate({ scope: scopeFor(subject), signedAt, file })
    }

    return {
        signedAt,
        setSignedAt,
        file,
        setFile,
        publish,
        askForConfirmation,
        stopConfirming,
        isPending,
        isSettled: isSuccess,
        canPublish: Boolean(subject && signedAt && file) && !isPending && !isSuccess,
        isConfirming: confirming && Boolean(subject),
    }
}

// Stays open for the publish: closing first left the upload running behind an idle-looking form,
// and a second click published twice.
export const ConfirmPublishModal: FC<{
    isOpen: boolean
    signedAt: string
    file: File | null
    isPending: boolean
    isSettled: boolean
    onCancel: () => void
    onConfirm: () => void
    subject: ReactNode
    consequence: ReactNode
}> = ({ isOpen, signedAt, file, isPending, isSettled, onCancel, onConfirm, subject, consequence }) => (
    <AppModal isOpen={isOpen} onClose={onCancel} title="Publish this file?" zIndex={400}>
        <Stack>
            {subject}
            <ReadOnlyField label="Signed on" value={formatDayString(signedAt)} />
            <ReadOnlyField label="File" value={file?.name ?? ''} />
            <Text>{consequence}</Text>
            <Group justify="flex-end">
                <Button variant="subtle" onClick={onCancel} disabled={isPending}>
                    Cancel
                </Button>
                <Button onClick={onConfirm} loading={isPending} disabled={isSettled}>
                    Yes, publish
                </Button>
            </Group>
        </Stack>
    </AppModal>
)
