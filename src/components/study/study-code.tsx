'use client'

import { useCallback, useRef, useState, type FC } from 'react'
import type { Route } from 'next'
import { type StudyCodeIDE, useIDEFiles } from '@/hooks/use-ide-files'
import { Button, Group, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink } from '@/components/links'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import { SaveStatusIndicator } from '@/components/save-status'
import { StudyAgreementPreparingNotice } from '@/components/legal/study-agreement-preparing-notice'
import { blocksStudyWork } from '@/schema/legal-document'
import { useStudyAgreementStatus } from '@/components/legal/require-study-agreement'
import { SUBMIT_CODE_ERROR_ID } from './submit-code-error'
import { ProposalStepHeader } from './proposal-step-header'
import { SubmitCodeFaq } from './submit-code-faq'
import { YourFilesSection } from './your-files-section'

const STEP_LABEL = 'STEP 3'
const SECTION_TITLE = 'Submit code'

/** `Spacing/lg` in the Figma frames. Mantine `lg` is 20px in this app's theme, the token is 24px. */
const CARD_SECTION_GAP = 24

interface StudyCodeProps {
    studyId: string
    dataPartnerName: string
    isFirstVisit: boolean
    previousHref: Route
    onSubmitSuccess?: () => void
}

const SubmitCodeIntro: FC<{ dataPartnerName: string }> = ({ dataPartnerName }) => (
    <Text data-testid="submit-code-intro">
        Develop and test your code in the SafeInsights IDE (Integrated Development Environment) with preloaded example
        data from {dataPartnerName}. The IDE opens in a new tab, and any files you create will appear here
        automatically. When you are ready,{' '}
        <Text span fw={700}>
            return here, select your main file, and submit your code for review
        </Text>
        .
    </Text>
)

type SubmitCodeFooterProps = {
    studyId: string
    previousHref: Route
    ide: StudyCodeIDE
    isBlockedByAgreement: boolean
    onSubmitClick: () => void
}

const SubmitCodeFooter: FC<SubmitCodeFooterProps> = ({
    studyId,
    previousHref,
    ide,
    isBlockedByAgreement,
    onSubmitClick,
}) => (
    <Stack w="100%">
        <StudyAgreementPreparingNotice studyId={studyId} consequence="You cannot submit code yet." />
        <Group justify="space-between" w="100%">
            <ButtonLink href={previousHref} size="md" variant="subtle" leftSection={<CaretLeftIcon />}>
                Previous step
            </ButtonLink>
            <Group gap="md" wrap="nowrap" align="center" data-testid="submit-row">
                <SaveStatusIndicator status={ide.saveStatus} />
                {/* The legal gate is the one reason that disables: no amount of editing clears it, and
                    the notice above already states it. Every other reason validates on click instead, so
                    it can be named. aria-describedby keeps that reason reachable on tabbing back. */}
                <Button
                    disabled={isBlockedByAgreement}
                    loading={ide.isDirectSubmitting}
                    onClick={onSubmitClick}
                    aria-describedby={SUBMIT_CODE_ERROR_ID}
                >
                    Submit code for review
                </Button>
            </Group>
        </Group>
    </Stack>
)

export const StudyCode = ({
    studyId,
    dataPartnerName,
    isFirstVisit,
    previousHref,
    onSubmitSuccess,
}: StudyCodeProps) => {
    const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)
    const [submitAttempted, setSubmitAttempted] = useState(false)
    const footerRef = useRef<HTMLDivElement>(null)

    /**
     * A failed submission drops the confirmation and brings the button back into view, so the
     * retry the toast suggests is one click away rather than a scroll away. Guarded because
     * scrollIntoView is not implemented in the test DOM.
     */
    const handleSubmitError = useCallback(() => {
        closeConfirm()
        footerRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
    }, [closeConfirm])

    const ide = useIDEFiles({ studyId, onSubmitSuccess, onSubmitError: handleSubmitError })

    // Read here rather than inside useIDEFiles: the IDE hook has no other reason to know about
    // legal documents, and the notice beside the button already carries the explanation.
    const { status: agreementStatus } = useStudyAgreementStatus(studyId)
    const isBlockedByAgreement = blocksStudyWork(agreementStatus)

    // Derived rather than snapshotted at click time, so the message tracks the same data the button
    // does: fix the problem and it goes, break it again and it comes back.
    const submitError = submitAttempted ? ide.submitDisabledReason : null

    // The card's rule: the button always clicks, and a blocked attempt says why.
    const handleSubmitClick = () => {
        setSubmitAttempted(true)
        if (ide.submitDisabledReason) return

        openConfirm()
    }

    /**
     * The confirmation deliberately stays open with both buttons dead until the submission
     * resolves, which is what stops a second click becoming a second submission.
     */
    const handleConfirmSubmit = () => {
        if (ide.isDirectSubmitting) return
        ide.submitDirectly()
    }

    return (
        <>
            <Stack gap="xxl">
                {/* No studyTitle: the card forbids repeating the title as body text here. The
                    header's rule only draws when something follows it, which the children below do. */}
                <ProposalStepHeader stepLabel={STEP_LABEL} heading={SECTION_TITLE}>
                    <Stack gap={CARD_SECTION_GAP}>
                        <SubmitCodeIntro dataPartnerName={dataPartnerName} />
                        <SubmitCodeFaq dataPartnerName={dataPartnerName} isFirstVisit={isFirstVisit} />
                    </Stack>
                </ProposalStepHeader>

                <YourFilesSection ide={ide} dataPartnerName={dataPartnerName} submitError={submitError} />

                <div ref={footerRef}>
                    <SubmitCodeFooter
                        studyId={studyId}
                        previousHref={previousHref}
                        ide={ide}
                        isBlockedByAgreement={isBlockedByAgreement}
                        onSubmitClick={handleSubmitClick}
                    />
                </div>
            </Stack>

            <SubmitConfirmationModal
                isOpen={confirmOpen}
                onClose={closeConfirm}
                onConfirm={handleConfirmSubmit}
                isSubmitting={ide.isDirectSubmitting}
                title="Submit code for review?"
                body={`Your code will be sent to ${dataPartnerName} for review. If approved, it will run in the secure enclave. You will not be able to make changes after you submit.`}
                confirmLabel="Submit code"
            />
        </>
    )
}
