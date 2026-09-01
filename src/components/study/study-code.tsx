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

interface StudyCodeProps {
    studyId: string
    previousHref: Route
    onSubmitSuccess?: () => void
}

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

export const StudyCode = ({ studyId, previousHref, onSubmitSuccess }: StudyCodeProps) => {
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
                    when something follows it inside the card, so the files below are what make it
                    appear; rows 4-5 add the static copy and the FAQ above them, and row 6 lifts the
                    files into their own "Your files" card. */}
                <ProposalStepHeader stepLabel={STEP_LABEL} heading={SECTION_TITLE}>
                    <StudyCodeFilesSection ide={ide} />
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
