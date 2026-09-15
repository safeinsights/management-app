'use client'

import { FC } from 'react'
import { type UseFormReturnType } from '@mantine/form'
import { useEditResubmit } from '@/contexts/edit-resubmit'
import { ProposalFooter } from '@/app/[orgSlug]/study/[studyId]/proposal/proposal-footer'
import { invalidProposalFieldIds } from '@/app/[orgSlug]/study/[studyId]/proposal/use-proposal-submit-attempt'
import { ORDERED_FIELD_IDS } from '@/app/[orgSlug]/study/[studyId]/proposal/field-ids'
import { resubmitModalCopy } from '@/app/[orgSlug]/study/[studyId]/proposal/copy'
import { type ProposalFormValues } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'
import { RESUBMISSION_NOTE_FIELD_ID, type ResubmitNoteValue } from './schema'

// Page order: the proposal fields, then the feedback thread, then the note. The two forms share no
// wrapper whose positions could be compared, so the order is spelled out here.
const RESUBMIT_ORDERED_FIELD_IDS: string[] = [...ORDERED_FIELD_IDS, RESUBMISSION_NOTE_FIELD_ID]

function invalidResubmitFieldIds(
    form: UseFormReturnType<ProposalFormValues>,
    noteForm: UseFormReturnType<ResubmitNoteValue>,
): Set<string> {
    const invalid = invalidProposalFieldIds(form)
    if (noteForm.validate().hasErrors) invalid.add(RESUBMISSION_NOTE_FIELD_ID)
    return invalid
}

interface EditResubmitFooterProps {
    researcherName: string
    researcherId: string
    enclaveOrgSlug?: string
    orgName: string
    /** The persisted `study.title`, which this page reads for the reviewer preview but no longer edits. */
    studyTitle?: string | null
}

// Edit proposal's footer: the shared ProposalFooter wired to the edit-and-resubmit context, which
// adds the resubmission note to validation and to the flush before leaving (OTTER-762).
export const EditResubmitFooter: FC<EditResubmitFooterProps> = ({
    researcherName,
    researcherId,
    enclaveOrgSlug,
    orgName,
    studyTitle,
}) => {
    const { studyId, form, noteForm, flushNote, resubmit, isSubmitting, isSavingNote } = useEditResubmit()
    const validate = () => invalidResubmitFieldIds(form, noteForm)

    return (
        <ProposalFooter
            studyId={studyId}
            form={form}
            researcherName={researcherName}
            researcherId={researcherId}
            enclaveOrgSlug={enclaveOrgSlug}
            studyTitle={studyTitle}
            submitLabel="Resubmit proposal"
            modalCopy={resubmitModalCopy(orgName)}
            onSubmit={resubmit}
            isSubmitting={isSubmitting}
            validate={validate}
            orderedFieldIds={RESUBMIT_ORDERED_FIELD_IDS}
            flushBeforeLeave={flushNote}
            isFlushing={isSavingNote}
        />
    )
}
