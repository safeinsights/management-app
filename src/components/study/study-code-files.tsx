import type { StudyCodeIDE } from '@/hooks/use-ide-files'

const isFilesReviewState = (ide: StudyCodeIDE) => !ide.isLoadingFiles && !ide.showEmptyState

type LaunchIdeVisibility = {
    ide: StudyCodeIDE
    isEditable?: boolean
    showLaunchIde?: boolean
}

/**
 * Whether the header Launch IDE shows. Shared because the Code files card renders it for Submit code
 * while /resubmit renders it from the step header, and the two must not drift.
 */
export const showsLaunchIdeControl = ({ ide, isEditable = true, showLaunchIde = true }: LaunchIdeVisibility) =>
    isEditable && showLaunchIde && isFilesReviewState(ide)
