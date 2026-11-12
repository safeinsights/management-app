'use client'

import { Button, Group, Stack, Text } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import type { FC } from 'react'
import { LinkWithIcon } from '@/components/links'
import { legalDocumentDownloadURL } from '@/lib/paths'
import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { AcknowledgementCheckbox } from './acknowledgement-checkbox'
import { AcknowledgementError, BlockingModal } from './blocking-modal'

const STUDY_AGREEMENT_LABEL = legalDocumentTypeLabels.SLA

const CHECKBOX_LABEL = `I have read and acknowledge the ${STUDY_AGREEMENT_LABEL}.`

type Props = {
    versionId?: string
    isChecked: boolean
    onCheckedChange: (checked: boolean) => void
    onContinue: () => void
    onCancel: () => void
    isSubmitting: boolean
    error: string | null
}

// The agreement is a PDF, so it opens in a tab rather than rendering inline as the Terms of Service
// does. Cancel goes to the dashboard: this blocks one study, not the app, so declining has somewhere
// to go.
export const StudyAgreementModal: FC<Props> = ({
    versionId,
    isChecked,
    onCheckedChange,
    onContinue,
    onCancel,
    isSubmitting,
    error,
}) => {
    if (!versionId) return null

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

                <AcknowledgementCheckbox checked={isChecked} onChange={onCheckedChange} label={CHECKBOX_LABEL} />

                <AcknowledgementError error={error} />

                <Group>
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
