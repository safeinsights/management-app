'use client'

import { SelectedStudy } from '@/server/actions/study.actions'
import { useResubmitStudy } from '@/hooks/use-resubmit-study'
import { UploadOrLaunch, ReviewUploadedFiles, ImportIDEFiles } from './views'

export function ResubmitStudyCodeForm({ study }: { study: SelectedStudy }) {
    const {
        viewMode,
        uploadedFiles,
        uploadMainFile,
        filteredIdeFiles,
        currentIdeMainFile,
        lastModified,
        showEmptyState,
        isLoadingFiles,
        isIDELoading,
        ideLoadingMessage,
        launchError,
        isPending,
        canSubmitUpload,
        canSubmitFromIDE,
        launchWorkspace,
        handleImportFiles,
        resubmitStudy,
    } = useResubmitStudy(study)

    const orgSlug = study.submittedByOrgSlug!

    if (viewMode === 'review') {
        return (
            <ReviewUploadedFiles
                studyId={study.id}
                orgSlug={orgSlug}
                uploadedFiles={uploadedFiles}
                uploadMainFile={uploadMainFile}
                canSubmitUpload={canSubmitUpload}
                isPending={isPending}
                onResubmit={() => resubmitStudy()}
            />
        )
    }

    if (viewMode === 'import-ide') {
        return (
            <ImportIDEFiles
                studyId={study.id}
                orgSlug={orgSlug}
                filteredIdeFiles={filteredIdeFiles}
                currentIdeMainFile={currentIdeMainFile}
                lastModified={lastModified}
                showEmptyState={showEmptyState}
                isLoadingFiles={isLoadingFiles}
                isIDELoading={isIDELoading}
                ideLoadingMessage={ideLoadingMessage}
                launchError={launchError}
                canSubmitFromIDE={canSubmitFromIDE}
                isPending={isPending}
                onLaunchWorkspace={launchWorkspace}
                onImportFiles={handleImportFiles}
                onResubmit={() => resubmitStudy()}
            />
        )
    }

    return (
        <UploadOrLaunch
            studyId={study.id}
            orgSlug={orgSlug}
            studyOrgSlug={study.orgSlug}
            language={study.language}
            uploadedFiles={uploadedFiles}
            isIDELoading={isIDELoading}
            launchError={launchError}
            isPending={isPending}
            onLaunchWorkspace={launchWorkspace}
        />
    )
}
