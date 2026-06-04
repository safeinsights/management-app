'use client'

import type { Route } from 'next'
import { useIDEFiles } from '@/hooks/use-ide-files'
import { Button, Group, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink } from '@/components/links'
import { SubmitConfirmationModal } from '@/components/submit-confirmation-modal'
import { StudyCodePanel } from './study-code-panel'

interface StudyCodeProps {
    studyId: string
    studyTitle: string | null
    previousHref: Route
    onSubmitSuccess?: () => void
}

export const StudyCode = ({ studyId, studyTitle, previousHref, onSubmitSuccess }: StudyCodeProps) => {
    const ide = useIDEFiles({ studyId, onSubmitSuccess })
    const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)

    const footer = (
        <Group mt="xxl" justify="space-between" w="100%">
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
                    variant="primary"
                    disabled={!ide.canSubmit}
                    loading={ide.isDirectSubmitting}
                    onClick={openConfirm}
                >
                    Submit code
                </Button>
            </Stack>
        </Group>
    )

    return (
        <>
            <StudyCodePanel ide={ide} stepLabel="STEP 4 of 4" studyTitle={studyTitle} footer={footer} />
            <SubmitConfirmationModal
                isOpen={confirmOpen}
                onClose={closeConfirm}
                onConfirm={ide.submitDirectly}
                isSubmitting={ide.isDirectSubmitting}
                title="Confirm study code submission?"
                body="Please confirm you are ready to submit your study code. Further edits are not permitted once submitted."
                confirmLabel="Yes, submit study code"
            />
        </>
    )
}
