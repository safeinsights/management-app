'use client'

import { useMemo, useQuery, useState, type FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import { legalDocumentQueryKeys } from '@/schema/legal-document'
import {
    fetchStudiesAwaitingStudyAgreementAction,
    fetchStudyAgreementsAction,
} from '@/server/actions/legal-document.actions'
import { Button, Group, Select, Stack, Text } from '@mantine/core'
import * as R from 'remeda'
import { PdfDropzone } from '../pdf-dropzone'
import { ConfirmPublishModal, useAgreementUpload } from '../publish-agreement'
import { ReadOnlyField } from '../read-only-field'
import { SignedOnInput } from '../signed-on-input'

type Candidate = ActionSuccessType<typeof fetchStudiesAwaitingStudyAgreementAction>[number]
type StudyAgreement = ActionSuccessType<typeof fetchStudyAgreementsAction>[number]

type StudyDetails = Pick<StudyAgreement, 'studyId' | 'studyTitle' | 'researchLabName' | 'dataPartnerName'>

const toOptions = (pairs: [string, string][]) =>
    R.pipe(
        pairs,
        R.uniqueBy(([value]) => value),
        R.map(([value, label]) => ({ value, label })),
    )

const useStudyAgreementCandidates = ({ enabled }: { enabled: boolean }) => {
    const { data: candidates = [], isLoading } = useQuery({
        queryKey: legalDocumentQueryKeys.studiesAwaitingStudyAgreement(),
        queryFn: fetchStudiesAwaitingStudyAgreementAction,
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
        isEmpty: !isLoading && candidates.length === 0,
        dataPartnerId,
        researchLabId,
        studyId,
        dataPartnerOptions,
        researchLabOptions,
        studyOptions,
        chooseDataPartner,
        chooseResearchLab,
        setStudyId,
        selected: candidates.find((c: Candidate) => c.studyId === studyId),
    }
}

const STUDY_AGREEMENT_INVALIDATE_KEYS = [
    legalDocumentQueryKeys.studyAgreements(),
    legalDocumentQueryKeys.studiesAwaitingStudyAgreement(),
    legalDocumentQueryKeys.versionsForType('SLA'),
]

const StudyFields: FC<{ details: StudyDetails }> = ({ details }) => (
    <>
        <ReadOnlyField label="Study" value={details.studyTitle || details.studyId} />
        <ReadOnlyField label="Research Lab" value={details.researchLabName} />
        <ReadOnlyField label="Data Partner" value={details.dataPartnerName} />
    </>
)

const NoStudiesWaiting: FC = () => (
    <Text c="dimmed">
        No approved studies are waiting for a study agreement. A study becomes available here once its proposal has been
        approved and it does not already have one.
    </Text>
)

const StudySelect: FC<{
    isVisible: boolean
    candidates: ReturnType<typeof useStudyAgreementCandidates>
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
                description="Only approved studies without a study agreement are listed"
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

const VersionNote: FC<{ agreement: StudyAgreement | undefined }> = ({ agreement }) => {
    if (!agreement) return null

    return (
        <Text size="sm" c="dimmed">
            This study is on version {agreement.versionNumber}. Publishing makes the new file the current agreement;
            earlier versions stay in the record.
        </Text>
    )
}

const ChosenStudyFields: FC<{ details: StudyDetails | undefined }> = ({ details }) => {
    if (!details) return null
    return <StudyFields details={details} />
}

// Says nothing about acknowledgement: only tos/pn are in enforcedLegalDocumentTypes.
const PUBLISH_CONSEQUENCE =
    'This becomes the current Study Agreement on record for this study. Earlier versions stay in the record. This cannot be undone.'

export const UploadStudyAgreementForm: FC<{ onCompleteAction: () => void; agreement?: StudyAgreement }> = ({
    onCompleteAction,
    agreement,
}) => {
    const candidates = useStudyAgreementCandidates({ enabled: !agreement })
    const details = agreement ?? candidates.selected
    const upload = useAgreementUpload({
        subject: details,
        scopeFor: (study: StudyDetails) => ({ type: 'SLA' as const, studyId: study.studyId }),
        invalidateKeys: STUDY_AGREEMENT_INVALIDATE_KEYS,
        onComplete: onCompleteAction,
    })

    if (!agreement && candidates.isEmpty) return <NoStudiesWaiting />

    return (
        <Stack>
            <StudySelect isVisible={!agreement} candidates={candidates} />
            <ChosenStudyFields details={agreement} />
            <VersionNote agreement={agreement} />
            <SignedOnInput value={upload.signedAt} onChange={upload.setSignedAt} />
            <PdfDropzone label="Signed Study Agreement" file={upload.file} onChange={upload.setFile} />
            <Group justify="flex-end">
                <Button onClick={upload.askForConfirmation} disabled={!upload.canPublish}>
                    Publish
                </Button>
            </Group>
            <ConfirmPublishModal
                isOpen={upload.isConfirming}
                signedAt={upload.signedAt}
                file={upload.file}
                isPending={upload.isPending}
                isSettled={upload.isSettled}
                onCancel={upload.stopConfirming}
                onConfirm={upload.publish}
                subject={<ChosenStudyFields details={details} />}
                consequence={PUBLISH_CONSEQUENCE}
            />
        </Stack>
    )
}
