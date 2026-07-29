'use client'

import { useMutation, useQuery, useQueryClient, type FC } from '@/common'
import { reportError } from '@/components/errors'
import { uploadFiles } from '@/hooks/upload'
import type { ActionSuccessType } from '@/lib/types'
import {
    createLegalDocumentDraftAction,
    fetchStudiesAwaitingSlaAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { actionResult } from '@/lib/utils'
import { Button, FileInput, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import * as R from 'remeda'
import { useMemo, useState } from 'react'

type Candidate = ActionSuccessType<typeof fetchStudiesAwaitingSlaAction>[number]

const toOptions = (pairs: [string, string][]) =>
    R.pipe(
        pairs,
        R.uniqueBy(([value]) => value),
        R.map(([value, label]) => ({ value, label })),
    )

// Fetched once and narrowed in memory as the Data Partner > Research Lab > study cascade is used.
const useSlaCandidates = () => {
    const { data: candidates = [], isLoading } = useQuery({
        queryKey: ['studiesAwaitingSla'],
        queryFn: fetchStudiesAwaitingSlaAction,
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
    }
}

const useUploadSla = ({ onComplete }: { onComplete: () => void }) => {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ studyId, signedAt, file }: { studyId: string; signedAt: string; file: File }) => {
            // Publish last, so a failed upload leaves a replaceable draft rather than a live
            // agreement with no file.
            const { version, upload } = actionResult(
                await createLegalDocumentDraftAction({
                    type: 'sla',
                    studyId,
                    fileName: file.name,
                    format: 'pdf',
                }),
            )
            await uploadFiles([[file, upload]])
            return actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt }))
        },
        // Wrapped because react-query's second arg is the variables, which reportError reads as a title.
        onError: (error: unknown) => reportError(error),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['studyLevelAgreements'] })
            await queryClient.invalidateQueries({ queryKey: ['studiesAwaitingSla'] })
            onComplete()
        },
    })
}

const DetailsStep: FC<{
    isVisible: boolean
    candidates: ReturnType<typeof useSlaCandidates>
    signedAt: string
    onSignedAtChange: (value: string) => void
    onNext: () => void
}> = ({ isVisible, candidates, signedAt, onSignedAtChange, onNext }) => {
    if (!isVisible) return null

    const canContinue = Boolean(candidates.studyId && signedAt)

    return (
        <Stack>
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
            {/* Native date input keeps this a plain YYYY-MM-DD string; a Date would land a day
                early west of the server. */}
            <TextInput
                type="date"
                label="Signed on"
                description="The date the signatories signed the agreement"
                value={signedAt}
                onChange={(event) => onSignedAtChange(event.currentTarget.value)}
            />
            <Group justify="flex-end">
                <Button onClick={onNext} disabled={!canContinue}>
                    Next
                </Button>
            </Group>
        </Stack>
    )
}

const UploadStep: FC<{
    isVisible: boolean
    file: File | null
    onFileChange: (file: File | null) => void
    onPublish: () => void
    onBack: () => void
}> = ({ isVisible, file, onFileChange, onPublish, onBack }) => {
    if (!isVisible) return null

    return (
        <Stack>
            <FileInput
                label="Signed agreement"
                description="Upload the signed SLA as a PDF"
                placeholder="Select a PDF"
                accept="application/pdf"
                value={file}
                onChange={onFileChange}
            />
            <Group justify="space-between">
                <Button variant="subtle" onClick={onBack}>
                    Back
                </Button>
                <Button onClick={onPublish} disabled={!file}>
                    Publish
                </Button>
            </Group>
        </Stack>
    )
}

export const UploadSlaForm: FC<{ onCompleteAction: () => void }> = ({ onCompleteAction }) => {
    const candidates = useSlaCandidates()
    const [signedAt, setSignedAt] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [step, setStep] = useState<'details' | 'upload'>('details')
    const [confirming, { open: askForConfirmation, close: stopConfirming }] = useDisclosure(false)
    const { mutate: uploadSla, isPending } = useUploadSla({ onComplete: onCompleteAction })

    const publish = () => {
        stopConfirming()
        if (!candidates.studyId || !file) return
        uploadSla({ studyId: candidates.studyId, signedAt, file })
    }

    return (
        <Stack>
            <DetailsStep
                isVisible={step === 'details'}
                candidates={candidates}
                signedAt={signedAt}
                onSignedAtChange={setSignedAt}
                onNext={() => setStep('upload')}
            />
            <UploadStep
                isVisible={step === 'upload'}
                file={file}
                onFileChange={setFile}
                onPublish={askForConfirmation}
                onBack={() => setStep('details')}
            />
            <Modal opened={confirming} onClose={stopConfirming} title="Publish this file?" zIndex={400}>
                <Stack>
                    <Text>Are you sure you want to publish this file? This cannot be undone.</Text>
                    <Group justify="flex-end">
                        <Button variant="subtle" onClick={stopConfirming}>
                            Cancel
                        </Button>
                        <Button onClick={publish} loading={isPending}>
                            Yes, publish
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    )
}
