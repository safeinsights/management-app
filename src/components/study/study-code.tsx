'use client'

import type { FC } from 'react'
import type { Route } from 'next'
import { type StudyCodeIDE, useIDEFiles } from '@/hooks/use-ide-files'
import { Button, Group, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink } from '@/components/links'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import { ProposalStepHeader } from './proposal-step-header'
import { StudyCodeFilesSection } from './study-code-files'

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

const SubmitBlockedReason: FC<{ reason: string | null }> = ({ reason }) => {
    if (!reason) return null

    return (
        <Text size="sm" c="dimmed">
            {reason}
        </Text>
    )
}

type SubmitCodeFooterProps = {
    previousHref: Route
    ide: StudyCodeIDE
    onSubmitClick: () => void
}

// OTTER-693 rows 9-11 rework this row (autosave indicator, an always-enabled submit whose
// validation happens on click), so it is extracted for that work to land in one place.
const SubmitCodeFooter: FC<SubmitCodeFooterProps> = ({ previousHref, ide, onSubmitClick }) => (
    <Group justify="space-between" w="100%">
        <ButtonLink href={previousHref} size="md" variant="subtle" leftSection={<CaretLeftIcon />}>
            Previous
        </ButtonLink>
        <Stack align="flex-end" gap="xs">
            <SubmitBlockedReason reason={ide.submitDisabledReason} />
            <Button
                variant="primary"
                disabled={!ide.canSubmit}
                loading={ide.isDirectSubmitting}
                onClick={onSubmitClick}
            >
                Submit code
            </Button>
        </Stack>
    </Group>
)

export const StudyCode = ({ studyId, dataPartnerName, previousHref, onSubmitSuccess }: StudyCodeProps) => {
    const ide = useIDEFiles({ studyId, onSubmitSuccess })
    const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)

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
                    when something follows it inside the card, so the content below is what makes it
                    appear; row 5 adds the FAQ under the intro, and row 6 lifts the files into their
                    own "Your files" card. */}
                <ProposalStepHeader stepLabel={STEP_LABEL} heading={SECTION_TITLE}>
                    <Stack gap={CARD_SECTION_GAP}>
                        <SubmitCodeIntro dataPartnerName={dataPartnerName} />
                        <StudyCodeFilesSection ide={ide} />
                    </Stack>
                </ProposalStepHeader>

                <SubmitCodeFooter previousHref={previousHref} ide={ide} onSubmitClick={openConfirm} />
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
