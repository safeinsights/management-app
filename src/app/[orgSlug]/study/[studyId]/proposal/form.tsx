'use client'

import { FC } from 'react'
import { useParams } from 'next/navigation'
import { Stack } from '@mantine/core'
import { useProposal } from '@/contexts/proposal'
import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'
import { StudyKickOutProvider } from '@/hooks/use-study-status-on-reconnect'
import { DraftProposalFooter } from './footer'
import { ProposalFieldsSection, type MemberOption } from './proposal-fields-section'

const PROPOSAL_EDITABLE_STATUSES = ['DRAFT', 'CHANGE-REQUESTED'] as const

interface ProposalFormProps {
    members?: MemberOption[]
    orgName?: string
    researcherName?: string
    researcherId?: string
    enclaveOrgSlug?: string
    /**
     * The persisted `study.title`. Step 1 owns it now (OTTER-690), so this page reads it rather
     * than editing it, and passes it down for the reviewer preview.
     */
    studyTitle?: string | null
    /** Whether the viewer is the researcher who created this draft. Gates the Researcher row. */
    isDraftCreator?: boolean
}

export const ProposalForm: FC<ProposalFormProps> = ({
    members = [],
    orgName = '',
    researcherName = '',
    researcherId = '',
    enclaveOrgSlug,
    studyTitle,
    isDraftCreator = false,
}) => {
    const { studyId, form, websocketProvider, yjsForm, tabSessionId } = useProposal()
    const { orgSlug } = useParams<{ orgSlug: string }>()

    useSubmissionRedirectListener({
        provider: yjsForm.provider,
        orgSlug,
        studyId,
        currentTabId: tabSessionId,
    })

    return (
        <StudyKickOutProvider
            studyId={studyId}
            orgSlug={orgSlug}
            editableStatuses={PROPOSAL_EDITABLE_STATUSES}
            redirectTarget="studySubmitted"
        >
            <Stack gap="xxl">
                <ProposalFieldsSection
                    studyId={studyId}
                    form={form}
                    yjsForm={yjsForm}
                    websocketProvider={websocketProvider}
                    heading="Study proposal"
                    orgName={orgName}
                    members={members}
                    researcherName={researcherName}
                    isDraftCreator={isDraftCreator}
                />

                <DraftProposalFooter
                    researcherName={researcherName}
                    researcherId={researcherId}
                    enclaveOrgSlug={enclaveOrgSlug}
                    studyTitle={studyTitle}
                    orgName={orgName}
                />
            </Stack>
        </StudyKickOutProvider>
    )
}
