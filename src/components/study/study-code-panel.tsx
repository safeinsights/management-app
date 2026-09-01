import { useRef, type FC, type ReactNode } from 'react'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { FileOrImagePreviewModal } from '@/components/modals/file-or-image-preview-modal'
import type { StudyCodeIDE } from '@/hooks/use-ide-files'
import { isFilesReviewState, StudyCodeFileActions, StudyCodeFilesBody } from './study-code-files'

interface StudyCodePanelProps {
    ide: StudyCodeIDE
    stepLabel?: string
    heading?: string
    studyTitle: string | null
    footer: ReactNode
    showLaunchIde?: boolean
}

const PanelStepLabel: FC<{ stepLabel?: string }> = ({ stepLabel }) => {
    if (!stepLabel) return null

    return (
        <Text fz="sm" fw={700} c="gray.7">
            {stepLabel}
        </Text>
    )
}

/**
 * The pre-OTTER-693 single-card code screen. Sole consumer is now the /resubmit editor
 * (EditStudyCodeView): the Submit code page moved onto ProposalStepHeader + StudyCodeFilesSection,
 * and /resubmit keeps this layout until its own redesign lands. The files body and the action
 * buttons are shared with that card, so behaviour cannot drift between the two screens.
 */
export const StudyCodePanel = ({
    ide,
    stepLabel,
    heading = 'Study code',
    studyTitle,
    footer,
    showLaunchIde = true,
}: StudyCodePanelProps) => {
    const openRef = useRef<() => void>(null)
    const isReviewState = isFilesReviewState(ide)

    return (
        <>
            <Paper p="xl">
                <Stack gap="xs">
                    <PanelStepLabel stepLabel={stepLabel} />
                    <Title order={2} size="h4">
                        {heading}
                    </Title>
                    <Group justify="space-between" wrap="nowrap" align="baseline">
                        {/* 65ch ≈ 75 rendered chars in Open Sans */}
                        <Text size="sm" c="dimmed" maw="65ch" style={{ overflowWrap: 'break-word' }}>
                            Title: {studyTitle ?? 'Untitled draft'}
                        </Text>
                        <StudyCodeFileActions
                            isVisible={isReviewState}
                            ide={ide}
                            showLaunchIde={showLaunchIde}
                            openRef={openRef}
                        />
                    </Group>
                </Stack>
                <Divider my="lg" />
                <StudyCodeFilesBody ide={ide} showLaunchIde={showLaunchIde} openRef={openRef} />
            </Paper>

            {footer}

            <FileOrImagePreviewModal file={ide.viewingFile} onClose={ide.closeFileViewer} />
        </>
    )
}
