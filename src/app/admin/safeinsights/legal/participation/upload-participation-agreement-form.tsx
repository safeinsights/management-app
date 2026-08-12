'use client'

import { useQuery, useState, type FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentQueryKeys,
    legalDocumentTypeLabels,
    participationAgreementOrgLabels,
    type ParticipationAgreementType,
} from '@/schema/legal-document'
import {
    fetchParticipationAgreementsAction,
    fetchParticipationSignatoriesAction,
} from '@/server/actions/legal-document.actions'
import { Button, Group, Select, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { PdfDropzone } from '../pdf-dropzone'
import { ConfirmPublishModal, usePublishAgreement } from '../publish-agreement'
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
        queryKey: legalDocumentQueryKeys.participationSignatories(type),
        queryFn: () => fetchParticipationSignatoriesAction({ type }),
        enabled: !fixed,
    })
    const { data: agreements = [] } = useQuery({
        queryKey: legalDocumentQueryKeys.participationAgreements(type),
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

const invalidateKeysFor = (type: ParticipationAgreementType) => [
    legalDocumentQueryKeys.participationAgreements(type),
    legalDocumentQueryKeys.versionsForType(type),
]

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

// Says nothing about acknowledgement: a ropa/dopa is filed here, not enforced — only tos/pn are in
// enforcedLegalDocumentTypes, and org-scoped enforcement is SHRMP-302.
const publishConsequence = (documentLabel: string, orgName: string) =>
    `This becomes the current ${documentLabel} on record for ${orgName}. Earlier versions stay in the record. This cannot be undone.`

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
    const {
        mutate: publishAgreement,
        isPending,
        isSuccess,
    } = usePublishAgreement({ invalidateKeys: invalidateKeysFor(type), onComplete: onCompleteAction })

    const documentLabel = legalDocumentTypeLabels[type]
    const orgLabel = participationAgreementOrgLabels[type]
    const chosen = choice.signatory

    const publish = () => {
        if (!chosen || !file) return
        publishAgreement({ scope: { type, orgId: chosen.orgId }, signedAt, file })
    }

    return (
        <Stack>
            <SignatorySelect isVisible={!signatory} orgLabel={orgLabel} choice={choice} />
            <ChosenSignatory orgLabel={orgLabel} signatory={signatory} />
            <VersionNote versionNumber={chosen?.versionNumber} />
            <SignedOnInput value={signedAt} onChange={setSignedAt} />
            <PdfDropzone label={`Signed ${documentLabel}`} file={file} onChange={setFile} />
            <Group justify="flex-end">
                <Button onClick={askForConfirmation} disabled={!chosen || !signedAt || !file || isPending || isSuccess}>
                    Publish
                </Button>
            </Group>
            <ConfirmPublishModal
                isOpen={confirming && Boolean(chosen)}
                signedAt={signedAt}
                file={file}
                isPending={isPending}
                isSettled={isSuccess}
                onCancel={stopConfirming}
                onConfirm={publish}
                subject={<ChosenSignatory orgLabel={orgLabel} signatory={chosen} />}
                consequence={publishConsequence(documentLabel, chosen?.orgName ?? '')}
            />
        </Stack>
    )
}
