'use client'

import { FC, useMemo, useState } from 'react'
import { Anchor, Group, LoadingOverlay, Stack, Text, useMantineTheme } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import { useQuery } from '@/common'
import { ErrorAlert } from '@/components/errors'
import { DownloadBlobLink } from '@/components/download-blob-link'
import { FileOrImagePreviewModal } from '@/components/modals/file-or-image-preview-modal'
import { isApprovedLogType, isPlaintextLogType, logLabel } from '@/lib/file-type-helpers'
import { fetchApprovedJobFilesAction } from '@/server/actions/study-job.actions'
import { JobFile } from '@/lib/types'
import { LatestJobForStudy } from '@/server/db/queries'

// Results are job output and therefore attacker-controlled, so they must never be written as
// markup. FileOrImagePreviewModal renders them through the same escaped viewers the encrypted
// path uses, and handles the image/text split itself (OTTER-721).
const ViewResultsLink: FC<{ content: ArrayBuffer; path: string }> = ({ content, path }) => {
    const [previewing, setPreviewing] = useState(false)

    return (
        <>
            <Anchor role="button" onClick={() => setPreviewing(true)} style={{ display: 'flex', alignItems: 'center' }}>
                View <ArrowSquareOutIcon size={16} style={{ marginLeft: 4 }} />
            </Anchor>
            <FileOrImagePreviewModal
                file={previewing ? { name: path, contents: content } : null}
                onClose={() => setPreviewing(false)}
            />
        </>
    )
}

// Pre-PR #764 results: stored as plaintext APPROVED-RESULT / approved-log rows that were never
// encrypted for the researcher, so there is no key to ask for. This is the original JobResults view,
// retained for studies that finished before researcher result encryption shipped. JobResults routes
// only legacy jobs here; encrypted jobs go through EncryptedFilesPanel.
export const LegacyJobResults: FC<{ job: LatestJobForStudy }> = ({ job }) => {
    const {
        data: approvedFiles,
        isLoading,
        isError,
        error,
    } = useQuery({
        queryKey: ['job-results', job.id],
        queryFn: async () => await fetchApprovedJobFilesAction({ studyJobId: job.id }),
    })

    const { resultsFiles, logFiles } = useMemo(() => {
        const res: JobFile[] = []
        const logs: JobFile[] = []

        approvedFiles?.forEach((f) => {
            if (f.fileType === 'APPROVED-RESULT') res.push(f)
            else if (isApprovedLogType(f.fileType) || isPlaintextLogType(f.fileType)) logs.push(f)
        })

        return { resultsFiles: res, logFiles: logs }
    }, [approvedFiles])

    if (isError) {
        return <ErrorAlert error={error} />
    }

    if (isLoading || !approvedFiles) {
        return <LoadingOverlay />
    }

    return (
        <Stack>
            {resultsFiles.map((approvedFile) => (
                <ViewFile file={approvedFile} key={approvedFile.path} />
            ))}
            {logFiles.map((approvedFile) => (
                <ViewFile file={approvedFile} key={approvedFile.path} />
            ))}
        </Stack>
    )
}

export const ViewFile: FC<{ file: JobFile }> = ({ file }) => {
    const theme = useMantineTheme()
    return (
        <Group gap="xs">
            <Text size="sm" fw={600}>
                {logLabel(file.fileType)}:
            </Text>
            <ViewResultsLink content={file.contents} path={file.path} />
            <span
                style={{
                    height: 16,
                    borderLeft: `1px solid ${theme.colors.charcoal[4]}`,
                }}
            ></span>
            <DownloadBlobLink filename={file.path} fileContent={file.contents} />
        </Group>
    )
}
