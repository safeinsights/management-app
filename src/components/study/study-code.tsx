'use client'

import type { Route } from 'next'
import { useIDEFiles } from '@/hooks/use-ide-files'
import { Button, Group, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink } from '@/components/links'
import { SubmitConfirmationModal } from '@/components/modals/submit-confirmation-modal'
import { StudyAgreementPreparingNotice } from '@/components/legal/study-agreement-preparing-notice'
import { useStudyAgreementStatus } from '@/components/legal/require-study-agreement'
import { StudyCodePanel } from './study-code-panel'

interface StudyCodeProps {
    studyId: string
    previousHref: Route
    onSubmitSuccess?: () => void
}

export const StudyCode = ({ studyId, previousHref, onSubmitSuccess }: StudyCodeProps) => {
    const ide = useIDEFiles({ studyId, onSubmitSuccess })
    const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)

    // Read here rather than inside useIDEFiles: the IDE hook has no other reason to know about
    // legal documents, and the notice beside the button already carries the explanation.
    const agreementStatus = useStudyAgreementStatus(studyId)
    const isBlockedByAgreement = agreementStatus?.state === 'none'

    const handleConfirmSubmit = () => {
        closeConfirm()
        ide.submitDirectly()
    }

    const footer = (
        <Stack mt="xxl" w="100%">
            <StudyAgreementPreparingNotice studyId={studyId} isVisible />
            <Group justify="space-between" w="100%">
                <ButtonLink href={previousHref} size="md" variant="subtle" leftSection={<CaretLeftIcon />}>
                    Previous
                </ButtonLink>
                <Stack align="flex-end" gap="xs">
                    {ide.submitDisabledReason && (
                        <Text size="sm" c="dimmed">
                            {ide.submitDisabledReason}
                        </Text>
                    )}
                    <Button
                        disabled={!ide.canSubmit || isBlockedByAgreement}
                        loading={ide.isDirectSubmitting}
                        onClick={openConfirm}
                    >
                        Submit code
                    </Button>
                </Stack>
            </Group>
        </Stack>
    )

    return (
        <>
            <StudyCodePanel ide={ide} stepLabel="STEP 4 of 4" footer={footer} />
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
