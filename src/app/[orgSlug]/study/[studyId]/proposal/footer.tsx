'use client'

import { FC } from 'react'
import { useProposal } from '@/contexts/proposal'
import { ProposalFooter } from './proposal-footer'
import { invalidProposalFieldIds } from './use-proposal-submit-attempt'
import { submitModalCopy } from './copy'

interface DraftProposalFooterProps {
    researcherName: string
    researcherId: string
    enclaveOrgSlug?: string
    studyTitle?: string | null
    orgName: string
}

// Step 2's footer: the shared ProposalFooter wired to the draft proposal context.
export const DraftProposalFooter: FC<DraftProposalFooterProps> = ({
    researcherName,
    researcherId,
    enclaveOrgSlug,
    studyTitle,
    orgName,
}) => {
    const { studyId, form, submitProposal, isSubmitting } = useProposal()
    const validate = () => invalidProposalFieldIds(form)

    return (
        <ProposalFooter
            studyId={studyId}
            form={form}
            researcherName={researcherName}
            researcherId={researcherId}
            enclaveOrgSlug={enclaveOrgSlug}
            studyTitle={studyTitle}
            submitLabel="Submit proposal"
            modalCopy={submitModalCopy(orgName)}
            onSubmit={submitProposal}
            isSubmitting={isSubmitting}
            validate={validate}
        />
    )
}
