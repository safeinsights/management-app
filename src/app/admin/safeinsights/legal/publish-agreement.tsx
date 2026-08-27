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

// Which document the new version belongs to. tos/pn leave both scope fields off.
type DraftScope = { type: LegalDocumentTypeValue; orgId?: string; studyId?: string }

type PublishVariables = { scope: DraftScope; signedAt: string; file: File }

/**
 * Upload a signed agreement and publish it as the document's next version.
 *
 * Shared by the participation and study-level forms, which differ only in how the subject is chosen
 * and which caches go stale — everything from "make a draft" to "it is live" is the same. Publish
 * runs last so a failed upload leaves a replaceable draft rather than a live agreement with no file
 * behind it; a document that already has versions gets a new one rather than a second document.
 */
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

// Everything an upload form does that is not choosing the subject: the participation and
// study-level forms differ in what they publish against and in nothing else. `scopeFor` turns the
// chosen subject into the document to add a version to.
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
        // Settled rather than merely pending: the form stays mounted until the parent closes it.
        isSettled: isSuccess,
        canPublish: Boolean(subject && signedAt && file) && !isPending && !isSuccess,
        isConfirming: confirming && Boolean(subject),
    }
}

/**
 * Second, separate confirmation before anything is written, because publishing cannot be undone.
 *
 * Reads back the date and file itself; `subject` names whatever the version belongs to and
 * `consequence` says what publishing does, since only the caller knows whether that is an org's
 * participation agreement or a study's. Stays open for the duration of the publish: closing it first
 * left the upload running behind an idle-looking form, and a second click published twice.
 */
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
