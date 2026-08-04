'use client'

import { useMutation, useQueryClient, useState, type FC } from '@/common'
import { reportError } from '@/components/errors'
import { AppModal } from '@/components/modals/app-modal'
import { uploadFiles } from '@/hooks/upload'
import { actionResult } from '@/lib/utils'
import {
    legalDocumentTypeLabels,
    participationAgreementOrgLabels,
    type ParticipationAgreementType,
} from '@/schema/legal-document'
import {
    createLegalDocumentDraftAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { Button, FileInput, Group, Stack, Text, TextInput } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { ReadOnlyField } from '../read-only-field'

// The org comes from the table row that opened this form, so there is nothing to pick.
type Signatory = { orgId: string; orgName: string; versionNumber: number | null }

const useUploadParticipationAgreement = ({
    type,
    orgId,
    onComplete,
}: {
    type: ParticipationAgreementType
    orgId: string
    onComplete: () => void
}) => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ signedAt, file }: { signedAt: string; file: File }) => {
            // Publish last, so a failed upload leaves a replaceable draft rather than a live
            // agreement with no file behind it.
            const { version, upload } = actionResult(
                await createLegalDocumentDraftAction({ type, orgId, fileName: file.name }),
            )
            await uploadFiles([[file, upload]])
            return actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt }))
        },
        // Wrapped because react-query's second arg is the variables, which reportError reads as a title.
        onError: (error: unknown) => reportError(error),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['participationAgreements', type] })
            await queryClient.invalidateQueries({ queryKey: ['legalDocumentVersions', type, orgId] })
            onComplete()
        },
    })
}

const VersionNote: FC<{ versionNumber: number | null }> = ({ versionNumber }) => {
    if (!versionNumber) return null

    return (
        <Text size="sm" c="dimmed">
            This organization is on version {versionNumber}. Publishing makes the new file the current agreement;
            earlier versions stay in the record.
        </Text>
    )
}

// Publishing cannot be undone, so the confirmation repeats everything that is about to be written.
const ConfirmPublishModal: FC<{
    opened: boolean
    orgLabel: string
    orgName: string
    signedAt: string
    file: File | null
    isPending: boolean
    onCancel: () => void
    onConfirm: () => void
}> = ({ opened, orgLabel, orgName, signedAt, file, isPending, onCancel, onConfirm }) => (
    <AppModal isOpen={opened} onClose={onCancel} title="Publish this file?" zIndex={400}>
        <Stack>
            <ReadOnlyField label={orgLabel} value={orgName} />
            <ReadOnlyField label="Signed on" value={signedAt} />
            <ReadOnlyField label="File" value={file?.name ?? ''} />
            <Text>Are you sure you want to publish this file? This cannot be undone.</Text>
            <Group justify="flex-end">
                <Button variant="subtle" onClick={onCancel}>
                    Cancel
                </Button>
                <Button onClick={onConfirm} loading={isPending}>
                    Yes, publish
                </Button>
            </Group>
        </Stack>
    </AppModal>
)

export const UploadParticipationAgreementForm: FC<{
    type: ParticipationAgreementType
    signatory: Signatory
    onCompleteAction: () => void
}> = ({ type, signatory, onCompleteAction }) => {
    const [signedAt, setSignedAt] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [confirming, { open: askForConfirmation, close: stopConfirming }] = useDisclosure(false)
    const { mutate: upload, isPending } = useUploadParticipationAgreement({
        type,
        orgId: signatory.orgId,
        onComplete: onCompleteAction,
    })

    const orgLabel = participationAgreementOrgLabels[type]

    const publish = () => {
        stopConfirming()
        if (!file) return
        upload({ signedAt, file })
    }

    return (
        <Stack>
            <ReadOnlyField label={orgLabel} value={signatory.orgName} />
            <VersionNote versionNumber={signatory.versionNumber} />
            {/* Native date input keeps this a plain YYYY-MM-DD string; a Date would land a day
                early west of the server. */}
            <TextInput
                type="date"
                label="Signed on"
                description="The date the signatories signed the agreement"
                value={signedAt}
                onChange={(event) => setSignedAt(event.currentTarget.value)}
            />
            <FileInput
                label="Signed agreement"
                description={`Upload the signed ${legalDocumentTypeLabels[type]} as a PDF`}
                placeholder="Select a PDF"
                accept="application/pdf"
                value={file}
                onChange={setFile}
            />
            <Group justify="flex-end">
                {/* Publishing is what makes the agreement enforceable, so there is no separate
                    enforcement step to confirm here. */}
                <Button onClick={askForConfirmation} disabled={!signedAt || !file}>
                    Publish
                </Button>
            </Group>
            <ConfirmPublishModal
                opened={confirming}
                orgLabel={orgLabel}
                orgName={signatory.orgName}
                signedAt={signedAt}
                file={file}
                isPending={isPending}
                onCancel={stopConfirming}
                onConfirm={publish}
            />
        </Stack>
    )
}
