'use client'

import { useMutation, useQuery, useQueryClient, useState, type FC } from '@/common'
import { reportError } from '@/components/errors'
import { AppModal } from '@/components/modals/app-modal'
import { uploadFiles } from '@/hooks/upload'
import type { ActionSuccessType } from '@/lib/types'
import { actionResult } from '@/lib/utils'
import {
    legalDocumentTypeLabels,
    participationAgreementOrgLabels,
    type ParticipationAgreementType,
} from '@/schema/legal-document'
import {
    createLegalDocumentDraftAction,
    fetchParticipationAgreementsAction,
    fetchParticipationSignatoriesAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { Button, Group, Select, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { PdfDropzone } from '../pdf-dropzone'
import { ReadOnlyField } from '../read-only-field'
import { SignedOnInput } from '../signed-on-input'

type Agreement = ActionSuccessType<typeof fetchParticipationAgreementsAction>[number]

// What it takes to name the org being published against. A row from the table and an org picked
// from the dropdown both satisfy it, so the rest of the form does not care which one it has.
type Signatory = { orgId: string; orgName: string; versionNumber: number | null }

// Every org of this type is offered, including ones that have already signed: renewing is a new
// version of the same document. The version a chosen org is on comes from the agreements query the
// table behind this modal already loaded, rather than a second round trip.
const useSignatoryChoice = ({ type, fixed }: { type: ParticipationAgreementType; fixed?: Signatory }) => {
    const [orgId, setOrgId] = useState<string | null>(null)
    const { data: signatories = [], isLoading } = useQuery({
        queryKey: ['participationSignatories', type],
        queryFn: () => fetchParticipationSignatoriesAction({ type }),
        enabled: !fixed,
    })
    const { data: agreements = [] } = useQuery({
        queryKey: ['participationAgreements', type],
        queryFn: () => fetchParticipationAgreementsAction({ type }),
        enabled: !fixed,
    })

    const chosen = signatories.find((signatory: { orgId: string }) => signatory.orgId === orgId)
    const selected: Signatory | undefined = chosen && {
        orgId: chosen.orgId,
        orgName: chosen.orgName,
        versionNumber:
            agreements.find((agreement: Agreement) => agreement.orgId === chosen.orgId)?.versionNumber ?? null,
    }

    return {
        isLoading,
        orgId,
        setOrgId,
        options: signatories.map(({ orgId, orgName }: { orgId: string; orgName: string }) => ({
            value: orgId,
            label: orgName,
        })),
        signatory: fixed ?? selected,
    }
}

const useUploadParticipationAgreement = ({
    type,
    onComplete,
}: {
    type: ParticipationAgreementType
    onComplete: () => void
}) => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ orgId, signedAt, file }: { orgId: string; signedAt: string; file: File }) => {
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
            await queryClient.invalidateQueries({ queryKey: ['legalDocumentVersions', type] })
            onComplete()
        },
    })
}

// Only shown when the org is not already fixed by the row that opened the form.
const SignatorySelect: FC<{
    isVisible: boolean
    orgLabel: string
    choice: ReturnType<typeof useSignatoryChoice>
}> = ({ isVisible, orgLabel, choice }) => {
    if (!isVisible) return null

    return (
        <Select
            label={orgLabel}
            placeholder={`Select a ${orgLabel}`}
            data={choice.options}
            value={choice.orgId}
            onChange={choice.setOrgId}
            disabled={choice.isLoading}
            searchable
        />
    )
}

// Only shown when the org is fixed; the dropdown above already names the chosen one.
const ChosenSignatory: FC<{ orgLabel: string; signatory: Signatory | undefined }> = ({ orgLabel, signatory }) => {
    if (!signatory) return null
    return <ReadOnlyField label={orgLabel} value={signatory.orgName} />
}

const VersionNote: FC<{ versionNumber: number | null | undefined }> = ({ versionNumber }) => {
    if (!versionNumber) return null

    return (
        <Text size="sm" c="dimmed">
            This organization is on version {versionNumber}. Publishing makes the new file the current agreement;
            earlier versions stay in the record.
        </Text>
    )
}

// Publishing cannot be undone and it obligates people, so the confirmation repeats everything about
// to be written and names who will be asked to acknowledge it.
const ConfirmPublishModal: FC<{
    opened: boolean
    orgLabel: string
    signatory: Signatory | undefined
    signedAt: string
    file: File | null
    isPending: boolean
    onCancel: () => void
    onConfirm: () => void
}> = ({ opened, orgLabel, signatory, signedAt, file, isPending, onCancel, onConfirm }) => {
    if (!signatory) return null

    return (
        <AppModal isOpen={opened} onClose={onCancel} title="Publish this file?" zIndex={400}>
            <Stack>
                <ReadOnlyField label={orgLabel} value={signatory.orgName} />
                <ReadOnlyField label="Signed on" value={signedAt} />
                <ReadOnlyField label="File" value={file?.name ?? ''} />
                <Text>
                    Publishing sends this to all members of {signatory.orgName} and requires each of them to acknowledge
                    it before continuing. This cannot be undone.
                </Text>
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
}

// Given a `signatory`, this adds a version to that org: only a new date and file are collected.
// Without one, the org is picked from the dropdown.
export const UploadParticipationAgreementForm: FC<{
    type: ParticipationAgreementType
    signatory?: Signatory
    onCompleteAction: () => void
}> = ({ type, signatory, onCompleteAction }) => {
    const choice = useSignatoryChoice({ type, fixed: signatory })
    const [signedAt, setSignedAt] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [confirming, { open: askForConfirmation, close: stopConfirming }] = useDisclosure(false)
    const { mutate: upload, isPending } = useUploadParticipationAgreement({ type, onComplete: onCompleteAction })

    const orgLabel = participationAgreementOrgLabels[type]
    const chosen = choice.signatory

    const publish = () => {
        stopConfirming()
        if (!chosen || !file) return
        upload({ orgId: chosen.orgId, signedAt, file })
    }

    return (
        <Stack>
            <SignatorySelect isVisible={!signatory} orgLabel={orgLabel} choice={choice} />
            <ChosenSignatory orgLabel={orgLabel} signatory={signatory} />
            <VersionNote versionNumber={chosen?.versionNumber} />
            <SignedOnInput value={signedAt} onChange={setSignedAt} />
            <PdfDropzone label={`Signed ${legalDocumentTypeLabels[type]}`} file={file} onChange={setFile} />
            <Group justify="flex-end">
                {/* Publishing is what makes the agreement enforceable, so there is no separate
                    enforcement step to confirm here. */}
                <Button onClick={askForConfirmation} disabled={!chosen || !signedAt || !file}>
                    Publish
                </Button>
            </Group>
            <ConfirmPublishModal
                opened={confirming}
                orgLabel={orgLabel}
                signatory={chosen}
                signedAt={signedAt}
                file={file}
                isPending={isPending}
                onCancel={stopConfirming}
                onConfirm={publish}
            />
        </Stack>
    )
}
