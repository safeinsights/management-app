'use client'

import { Alert, Button, Checkbox, Group, Stack, Text } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import type { FC } from 'react'
import { LinkWithIcon } from '@/components/links'
import { legalDocumentDownloadURL } from '@/lib/paths'
import { BlockingModal } from './blocking-modal'

export const STUDY_AGREEMENT_LABEL = 'Study Agreement'

const CHECKBOX_LABEL = `I have read and acknowledge the ${STUDY_AGREEMENT_LABEL}.`

type Props = {
    isVisible: boolean
    versionId?: string
    isChecked: boolean
    onCheckedChange: (checked: boolean) => void
    onContinue: () => void
    onCancel: () => void
    isSubmitting: boolean
    error: string | null
}

const AcknowledgementError: FC<{ error: string | null }> = ({ error }) => {
    if (!error) return null

    return <Alert color="red">{error}</Alert>
}

// The agreement is a PDF, so it opens in a tab rather than rendering inline as the Terms of Service
// does. Cancel goes to the dashboard: this blocks one study, not the app, so declining has somewhere
// to go.
export const StudyAgreementModal: FC<Props> = ({
    isVisible,
    versionId,
    isChecked,
    onCheckedChange,
    onContinue,
    onCancel,
    isSubmitting,
    error,
}) => {
    if (!isVisible || !versionId) return null

    return (
        <BlockingModal title={STUDY_AGREEMENT_LABEL}>
            <Stack>
                <Text>
                    The{' '}
                    <LinkWithIcon
                        href={legalDocumentDownloadURL(versionId)}
                        target="_blank"
                        rel="noreferrer"
                        icon={<ArrowSquareOutIcon size={16} weight="bold" />}
                    >
                        {STUDY_AGREEMENT_LABEL}
                    </LinkWithIcon>{' '}
                    is now available. Please review before proceeding. You can later access the {STUDY_AGREEMENT_LABEL}{' '}
                    from the Legal section in your profile.
                </Text>

                <Checkbox
                    checked={isChecked}
                    onChange={(event) => onCheckedChange(event.currentTarget.checked)}
                    label={CHECKBOX_LABEL}
                />

                <AcknowledgementError error={error} />

                <Group justify="flex-end">
                    <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    {/* Mantine's `loading` blocks pointer clicks but leaves the button keyboard-focusable. */}
                    <Button onClick={onContinue} disabled={!isChecked || isSubmitting} loading={isSubmitting}>
                        Continue
                    </Button>
                </Group>
            </Stack>
        </BlockingModal>
    )
}
