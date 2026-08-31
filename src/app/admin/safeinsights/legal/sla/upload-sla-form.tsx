'use client'

import { useMemo, useQuery, useState, type FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import { legalDocumentQueryKeys } from '@/schema/legal-document'
import { fetchStudiesAwaitingSlaAction, fetchStudyLevelAgreementsAction } from '@/server/actions/legal-document.actions'
import { Button, Group, Select, Stack, Text } from '@mantine/core'
import * as R from 'remeda'
import { PdfDropzone } from '../pdf-dropzone'
import { ConfirmPublishModal, useAgreementUpload } from '../publish-agreement'
import { ReadOnlyField } from '../read-only-field'
import { SignedOnInput } from '../signed-on-input'

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
        queryKey: legalDocumentQueryKeys.studiesAwaitingSla(),
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
        // An SLA hangs off an approved study, so with none waiting the cascade has nothing to offer
        // and would otherwise render as three empty dropdowns that look broken.
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
        // The chosen row already carries the names, so nothing has to be looked up to describe it.
        selected: candidates.find((c: Candidate) => c.studyId === studyId),
    }
}

const SLA_INVALIDATE_KEYS = [
    legalDocumentQueryKeys.studyLevelAgreements(),
    legalDocumentQueryKeys.studiesAwaitingSla(),
    legalDocumentQueryKeys.versionsForType('SLA'),
]

const StudyFields: FC<{ details: StudyDetails }> = ({ details }) => (
    <>
        <ReadOnlyField label="Study" value={details.studyTitle || details.studyId} />
        <ReadOnlyField label="Research Lab" value={details.researchLabName} />
        <ReadOnlyField label="Data Partner" value={details.dataPartnerName} />
    </>
)

// Says why the cascade is empty. Both causes are ordinary states rather than faults: nothing has
// been approved yet, or every approved study already has one.
const NoStudiesWaiting: FC = () => (
    <Text c="dimmed">
        No approved studies are waiting for a study agreement. A study becomes available here once its proposal has been
        approved and it does not already have one.
    </Text>
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

const VersionNote: FC<{ sla: Sla | undefined }> = ({ sla }) => {
    if (!sla) return null

    return (
        <Text size="sm" c="dimmed">
            This study is on version {sla.versionNumber}. Publishing makes the new file the current agreement; earlier
            versions stay in the record.
        </Text>
    )
}

// Read back only for a study that came from the table; the cascade above already names the chosen one.
const ChosenStudyFields: FC<{ details: StudyDetails | undefined }> = ({ details }) => {
    if (!details) return null
    return <StudyFields details={details} />
}

// Says nothing about acknowledgement: an sla is filed here, not enforced — only tos/pn are in
// enforcedLegalDocumentTypes.
const PUBLISH_CONSEQUENCE =
    'This becomes the current Study Agreement on record for this study. Earlier versions stay in the record. This cannot be undone.'

// Given an `sla`, this adds a version to that study: the study and its orgs carry over from the row
// and only a new date and file are collected. Without one, the study is picked from the cascade.
export const UploadSlaForm: FC<{ onCompleteAction: () => void; sla?: Sla }> = ({ onCompleteAction, sla }) => {
    const candidates = useSlaCandidates({ enabled: !sla })
    const details = sla ?? candidates.selected
    const upload = useAgreementUpload({
        subject: details,
        scopeFor: (study: StudyDetails) => ({ type: 'SLA' as const, studyId: study.studyId }),
        invalidateKeys: SLA_INVALIDATE_KEYS,
        onComplete: onCompleteAction,
    })

    // Nothing to publish against, so the form is replaced rather than shown unfillable.
    if (!sla && candidates.isEmpty) return <NoStudiesWaiting />

    return (
        <Stack>
            <StudySelect isVisible={!sla} candidates={candidates} />
            <ChosenStudyFields details={sla} />
            <VersionNote sla={sla} />
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
