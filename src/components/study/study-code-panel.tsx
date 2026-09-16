import { useRef, type FC, type ReactNode } from 'react'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { FileOrImagePreviewModal } from '@/components/modals/file-or-image-preview-modal'
import type { StudyCodeIDE } from '@/hooks/use-ide-files'
import { isFilesReviewState, StudyCodeFileActions, StudyCodeFilesBody } from './study-code-files'
import { ReplaceFileModal } from './replace-file-modal'
import { IdeLaunchProgressModal } from './ide-launch-progress-modal'
import { IdeLaunchFailedModal } from './ide-launch-failed-modal'

interface StudyCodePanelProps {
    ide: StudyCodeIDE
    /** Named in the Template badge's hover card, the same source the resubmission note reads. */
    dataPartnerName: string
    stepLabel?: string
    heading?: string
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
    dataPartnerName,
    stepLabel,
    heading = 'Study code',
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
                    <Group justify="flex-end" wrap="nowrap">
                        <StudyCodeFileActions
                            isVisible={isReviewState}
                            ide={ide}
                            showLaunchIde={showLaunchIde}
                            openRef={openRef}
                        />
                    </Group>
                </Stack>
                <Divider my="lg" />
                <StudyCodeFilesBody
                    ide={ide}
                    dataPartnerName={dataPartnerName}
                    showLaunchIde={showLaunchIde}
                    openRef={openRef}
                />
            </Paper>

            {footer}

            <FileOrImagePreviewModal file={ide.viewingFile} onClose={ide.closeFileViewer} />

            {/* uploadFiles parks a colliding name until this resolves it, so without the modal a
                same-name upload here would be silently dropped — the common case on a resubmission. */}
            <ReplaceFileModal file={ide.pendingDuplicate} onResolve={ide.resolveDuplicate} />

            {/* LaunchIdeControl shows neither progress nor failure itself, so the card that mounts
                it owns both — otherwise a failed launch here would report nothing at all. */}
            <IdeLaunchProgressModal
                isOpen={ide.isLaunching}
                onAbandon={ide.abandonLaunch}
                dataPartnerName={dataPartnerName}
                buildLog={ide.launchBuildLog}
                agentLog={ide.launchAgentLog}
            />

            <IdeLaunchFailedModal
                isOpen={Boolean(ide.launchError)}
                onClose={ide.clearLaunchError}
                onRetry={ide.launchWorkspace}
                supportRef={ide.launchErrorEventId}
            />
        </>
    )
}
