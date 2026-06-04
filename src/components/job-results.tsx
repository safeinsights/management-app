'use client'

import React, { FC, useMemo, useState } from 'react'
import { Anchor, Button, Group, LoadingOverlay, Stack, Text, Textarea, useMantineTheme } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import { useQuery } from '@/common'
import { ErrorAlert } from '@/components/errors'
import { DownloadBlobLink } from '@/components/download-blob-link'
import { isApprovedLogType, logLabel } from '@/lib/file-type-helpers'
import { useDecryptFiles, type EncryptedJobFile } from '@/hooks/use-decrypt-files'
import { fetchApprovedJobFilesAction } from '@/server/actions/study-job.actions'
import { JobFile, JobFileInfo } from '@/lib/types'
import { LatestJobForStudy } from '@/server/db/queries'

const ViewResultsLink: FC<{ content: ArrayBuffer }> = ({ content }) => {
    const handleClick = () => {
        const decoder = new TextDecoder('utf-8')
        const decodedString = decoder.decode(content)
        const tab = window.open('about:blank', '_blank')
        if (!tab) {
            reportError('failed to open results window')
        }
        tab?.document.write(decodedString)
        tab?.document.close()
    }

    return (
        <Anchor role="button" onClick={handleClick} style={{ display: 'flex', alignItems: 'center' }}>
            View <ArrowSquareOutIcon size={16} style={{ marginLeft: 4 }} />
        </Anchor>
    )
}

// Researcher-facing view of shared results. There is no plaintext copy: the
// researcher decrypts the re-encrypted approved files with their own key (they
// are a recipient of the re-encryption done at approve time).
export const JobResults: FC<{ job: LatestJobForStudy }> = ({ job }) => {
    const [decryptedFiles, setDecryptedFiles] = useState<JobFileInfo[]>()

    const {
        data: approvedFiles,
        isLoading,
        isError,
        error,
    } = useQuery({
        queryKey: ['approved-files', job.id],
        queryFn: async () => await fetchApprovedJobFilesAction({ studyJobId: job.id }),
    })

    const {
        decrypt,
        isPending: isDecrypting,
        form,
    } = useDecryptFiles({
        encryptedFiles: approvedFiles as EncryptedJobFile[] | undefined,
        onSuccess: setDecryptedFiles,
    })

    const { resultsFiles, logFiles } = useMemo(() => {
        const res: JobFileInfo[] = []
        const logs: JobFileInfo[] = []

        decryptedFiles?.forEach((f) => {
            if (f.fileType === 'APPROVED-RESULT') res.push(f)
            else if (isApprovedLogType(f.fileType)) logs.push(f)
        })

        return { resultsFiles: res, logFiles: logs }
    }, [decryptedFiles])

    if (isError) {
        return <ErrorAlert error={error} />
    }

    if (isLoading) {
        return <LoadingOverlay />
    }

    if (!decryptedFiles) {
        return (
            <form onSubmit={form.onSubmit((values) => decrypt(values.privateKey))}>
                <Stack>
                    <Textarea
                        label={<Text mb="sm">Enter your key to view results</Text>}
                        resize="vertical"
                        placeholder="Enter your key to access encrypted results."
                        {...form.getInputProps('privateKey')}
                        key={form.key('privateKey')}
                    />
                    <Group>
                        <Button type="submit" disabled={!form.isValid()} loading={isDecrypting}>
                            View Results
                        </Button>
                    </Group>
                </Stack>
            </form>
        )
    }

    return (
        <Stack>
            {resultsFiles.map((file) => (
                <ViewFile file={file} key={file.path} />
            ))}
            {logFiles.map((file) => (
                <ViewFile file={file} key={file.path} />
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
            <ViewResultsLink content={file.contents} />
            <span
                style={{
                    height: 16,
                    borderLeft: `1px solid ${theme.colors.charcoal[4]}`,
                }}
            ></span>
            <DownloadBlobLink target="_blank" filename={file.path} fileContent={file.contents} />
        </Group>
    )
}
