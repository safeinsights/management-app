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
    previousHref: Route
    ide: StudyCodeIDE
    onSubmitClick: () => void
}

const SubmitCodeFooter: FC<SubmitCodeFooterProps> = ({ previousHref, ide, onSubmitClick }) => (
    <Group justify="space-between" w="100%">
        <ButtonLink href={previousHref} size="md" variant="subtle" leftSection={<CaretLeftIcon />}>
            Previous step
        </ButtonLink>
        <Group gap="md" wrap="nowrap" align="center" data-testid="submit-row">
            <SaveStatusIndicator status={ide.saveStatus} />
            {/* Never disabled, per the card: validation happens on click so the reason can be
                stated, rather than leaving a dead button to be puzzled over. aria-describedby
                keeps that reason reachable if the researcher tabs back here after it is read out. */}
            <Button loading={ide.isDirectSubmitting} onClick={onSubmitClick} aria-describedby={SUBMIT_CODE_ERROR_ID}>
                Submit code for review
            </Button>
        </Group>
    </Group>
)

export const StudyCode = ({
    studyId,
    dataPartnerName,
    isFirstVisit,
    previousHref,
    onSubmitSuccess,
}: StudyCodeProps) => {
    const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
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

    // The card's rule: the button always clicks, and a blocked attempt says why.
    const handleSubmitClick = () => {
        if (ide.submitDisabledReason) {
            setSubmitError(ide.submitDisabledReason)
            return
        }

        setSubmitError(null)
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
                    <SubmitCodeFooter previousHref={previousHref} ide={ide} onSubmitClick={handleSubmitClick} />
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
