'use client'

import { useMutation, useQuery, useQueryClient, type FC } from '@/common'
import { reportError } from '@/components/errors'
import { AppModal } from '@/components/modals/app-modal'
import { uploadFiles } from '@/hooks/upload'
import type { ActionSuccessType } from '@/lib/types'
import { actionResult } from '@/lib/utils'
import {
    createLegalDocumentDraftAction,
    fetchStudiesAwaitingSlaAction,
    fetchStudyLevelAgreementsAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { Button, FileInput, Group, Select, Stack, Text, TextInput } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import * as R from 'remeda'
import { useMemo, useState } from 'react'
import { ReadOnlyField } from '../read-only-field'

type Candidate = ActionSuccessType<typeof fetchStudiesAwaitingSlaAction>[number]
type Sla = ActionSuccessType<typeof fetchStudyLevelAgreementsAction>[number]

// What it takes to name the study being published against. A row from the table and a study picked
// through the cascade both satisfy it, so the rest of the form does not care which one it has.
type StudyDetails = Pick<Sla, 'studyId' | 'studyTitle' | 'researchLabName' | 'dataPartnerName'>

const toOptions = (pairs: [string, string][]) =>
    R.pipe(
        pairs,
        R.uniqueBy(([value]) => value),
        R.map(([value, label]) => ({ value, label })),
    )

// Fetched once and narrowed in memory as the Data Partner > Research Lab > study cascade is used.
const useSlaCandidates = ({ enabled }: { enabled: boolean }) => {
    const { data: candidates = [], isLoading } = useQuery({
        queryKey: ['studiesAwaitingSla'],
        queryFn: fetchStudiesAwaitingSlaAction,
        enabled,
    })
    const [dataPartnerId, setDataPartnerId] = useState<string | null>(null)
    const [researchLabId, setResearchLabId] = useState<string | null>(null)
    const [studyId, setStudyId] = useState<string | null>(null)

    const forDataPartner = candidates.filter((c: Candidate) => c.dataPartnerId === dataPartnerId)
    const forResearchLab = forDataPartner.filter((c: Candidate) => c.researchLabId === researchLabId)

    const dataPartnerOptions = useMemo(
        () => toOptions(candidates.map((c: Candidate) => [c.dataPartnerId, c.dataPartnerName] as [string, string])),
        [candidates],
    )
    const researchLabOptions = toOptions(
        forDataPartner.map((c: Candidate) => [c.researchLabId, c.researchLabName] as [string, string]),
    )
    const studyOptions = toOptions(
        forResearchLab.map((c: Candidate) => [c.studyId, c.studyTitle || c.studyId] as [string, string]),
    )

    // A different parent invalidates the choices below it.
    const chooseDataPartner = (value: string | null) => {
        setDataPartnerId(value)
        setResearchLabId(null)
        setStudyId(null)
    }
    const chooseResearchLab = (value: string | null) => {
        setResearchLabId(value)
        setStudyId(null)
    }

    return {
        isLoading,
        dataPartnerId,
        researchLabId,
        studyId,
        dataPartnerOptions,
        researchLabOptions,
        studyOptions,
        chooseDataPartner,
        chooseResearchLab,
        setStudyId,
        // The chosen row already carries the names, so nothing has to be looked up to describe it.
        selected: candidates.find((c: Candidate) => c.studyId === studyId),
    }
}

const useUploadSla = ({ onComplete }: { onComplete: () => void }) => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ studyId, signedAt, file }: { studyId: string; signedAt: string; file: File }) => {
            // Publish last, so a failed upload leaves a replaceable draft rather than a live
            // agreement with no file. A study that already has an SLA gets a new version of it
            // rather than a second document.
            const { version, upload } = actionResult(
                await createLegalDocumentDraftAction({ type: 'sla', studyId, fileName: file.name }),
            )
            await uploadFiles([[file, upload]])
            return actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt }))
        },
        // Wrapped because react-query's second arg is the variables, which reportError reads as a title.
        onError: (error: unknown) => reportError(error),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['studyLevelAgreements'] })
            await queryClient.invalidateQueries({ queryKey: ['studiesAwaitingSla'] })
            await queryClient.invalidateQueries({ queryKey: ['legalDocumentVersions', 'sla'] })
            onComplete()
        },
    })
}

const StudyFields: FC<{ details: StudyDetails }> = ({ details }) => (
    <>
        <ReadOnlyField label="Study" value={details.studyTitle || details.studyId} />
        <ReadOnlyField label="Research Lab" value={details.researchLabName} />
        <ReadOnlyField label="Data Partner" value={details.dataPartnerName} />
    </>
)

// Only shown when the study is not already fixed by the row that opened the form.
const StudySelect: FC<{
    isVisible: boolean
    candidates: ReturnType<typeof useSlaCandidates>
}> = ({ isVisible, candidates }) => {
    if (!isVisible) return null

    return (
        <>
            <Select
                label="Data Partner"
                placeholder="Select a Data Partner"
                data={candidates.dataPartnerOptions}
                value={candidates.dataPartnerId}
                onChange={candidates.chooseDataPartner}
                disabled={candidates.isLoading}
                searchable
            />
            <Select
                label="Research Lab"
                placeholder="Select a Research Lab"
                data={candidates.researchLabOptions}
                value={candidates.researchLabId}
                onChange={candidates.chooseResearchLab}
                disabled={!candidates.dataPartnerId}
                searchable
            />
            <Select
                label="Study"
                description="Only approved studies that do not already have an SLA are listed"
                placeholder="Select a study"
                data={candidates.studyOptions}
                value={candidates.studyId}
                onChange={candidates.setStudyId}
                disabled={!candidates.researchLabId}
                searchable
            />
        </>
    )
}

const VersionNote: FC<{ sla: Sla | undefined }> = ({ sla }) => {
    if (!sla) return null

    return (
        <Text size="sm" c="dimmed">
            This study is on version {sla.versionNumber ?? 1}. Publishing makes the new file the current agreement;
            earlier versions stay in the record.
        </Text>
    )
}

// Read back only for a study that came from the table; the cascade above already names the chosen one.
const ChosenStudyFields: FC<{ details: StudyDetails | undefined }> = ({ details }) => {
    if (!details) return null
    return <StudyFields details={details} />
}

// Publishing cannot be undone, so the confirmation repeats everything that is about to be written.
const ConfirmPublishModal: FC<{
    opened: boolean
    details: StudyDetails | undefined
    signedAt: string
    file: File | null
    isPending: boolean
    onCancel: () => void
    onConfirm: () => void
}> = ({ opened, details, signedAt, file, isPending, onCancel, onConfirm }) => {
    if (!details) return null

    return (
        <AppModal isOpen={opened} onClose={onCancel} title="Publish this file?" zIndex={400}>
            <Stack>
                <StudyFields details={details} />
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
}

// Given an `sla`, this adds a version to that study: the study and its orgs carry over from the row
// and only a new date and file are collected. Without one, the study is picked from the cascade.
export const UploadSlaForm: FC<{ onCompleteAction: () => void; sla?: Sla }> = ({ onCompleteAction, sla }) => {
    const candidates = useSlaCandidates({ enabled: !sla })
    const [signedAt, setSignedAt] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [confirming, { open: askForConfirmation, close: stopConfirming }] = useDisclosure(false)
    const { mutate: uploadSla, isPending } = useUploadSla({ onComplete: onCompleteAction })

    const details = sla ?? candidates.selected

    const publish = () => {
        stopConfirming()
        if (!details || !file) return
        uploadSla({ studyId: details.studyId, signedAt, file })
    }

    return (
        <Stack>
            <StudySelect isVisible={!sla} candidates={candidates} />
            <ChosenStudyFields details={sla} />
            <VersionNote sla={sla} />
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
                description="Upload the signed SLA as a PDF"
                placeholder="Select a PDF"
                accept="application/pdf"
                value={file}
                onChange={setFile}
            />
            <Group justify="flex-end">
                <Button onClick={askForConfirmation} disabled={!details || !signedAt || !file}>
                    Publish
                </Button>
            </Group>
            <ConfirmPublishModal
                opened={confirming}
                details={details}
                signedAt={signedAt}
                file={file}
                isPending={isPending}
                onCancel={stopConfirming}
                onConfirm={publish}
            />
        </Stack>
    )
}
