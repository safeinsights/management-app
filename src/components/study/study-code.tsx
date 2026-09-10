'use client'

import { useState, type FC } from 'react'
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
        {/* The card puts the autosave state to the left of the submit button, so the researcher
            sees their work is kept at the moment they decide to hand it over. */}
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

export const StudyCode = ({ studyId, dataPartnerName, previousHref, onSubmitSuccess }: StudyCodeProps) => {
    const ide = useIDEFiles({ studyId, onSubmitSuccess })
    const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)
    const [submitError, setSubmitError] = useState<string | null>(null)

    // The card's rule: the button always clicks, and a blocked attempt says why.
    const handleSubmitClick = () => {
        if (ide.submitDisabledReason) {
            setSubmitError(ide.submitDisabledReason)
            return
        }

        setSubmitError(null)
        openConfirm()
    }

    const handleConfirmSubmit = () => {
        closeConfirm()
        ide.submitDirectly()
    }

    return (
        <>
            <Stack gap="xxl">
                {/* ProposalStepHeader supplies the card, the eyebrow, the heading and the 24px
                    divider, which is OTTER-693's "reuse the section header component" requirement.
                    No studyTitle: the card forbids repeating the title as body text here, and
                    StudyCode no longer receives one so it cannot drift back. The rule draws only
                    when something follows it inside the card, which the intro and FAQ below do. */}
                <ProposalStepHeader stepLabel={STEP_LABEL} heading={SECTION_TITLE}>
                    <Stack gap={CARD_SECTION_GAP}>
                        <SubmitCodeIntro dataPartnerName={dataPartnerName} />
                        <SubmitCodeFaq dataPartnerName={dataPartnerName} />
                    </Stack>
                </ProposalStepHeader>

                <YourFilesSection ide={ide} dataPartnerName={dataPartnerName} submitError={submitError} />

                <SubmitCodeFooter previousHref={previousHref} ide={ide} onSubmitClick={handleSubmitClick} />
            </Stack>

            <SubmitConfirmationModal
                isOpen={confirmOpen}
                onClose={closeConfirm}
                onConfirm={handleConfirmSubmit}
                isSubmitting={ide.isDirectSubmitting}
                title="Confirm study code submission?"
                body="Please confirm you are ready to submit your study code. Further edits are not permitted once submitted."
                confirmLabel="Yes, submit study code"
            />
        </>
    )
}
