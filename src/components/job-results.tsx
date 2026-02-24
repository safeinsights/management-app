'use client'

import React, { FC, useEffect, useMemo, useState } from 'react'
import { Anchor, AnchorProps, Group, LoadingOverlay, Stack, Text, useMantineTheme } from '@mantine/core'
import { ArrowSquareOutIcon, DownloadSimpleIcon } from '@phosphor-icons/react/dist/ssr'
import { useQuery } from '@/common'
import { ErrorAlert } from '@/components/errors'
import { isApprovedLogType, logLabel } from '@/lib/file-type-helpers'
import { fetchApprovedJobFilesAction } from '@/server/actions/study-job.actions'
import { JobFile } from '@/lib/types'
import { LatestJobForStudy } from '@/server/db/queries'

type DownloadLinkProps = AnchorProps & {
    filename: string
    content: ArrayBuffer
    target?: string
}

const DownloadResultsLink: FC<DownloadLinkProps> = ({ filename, content, target }) => {
    const [href, setHref] = useState('#')

    useEffect(() => {
        const blob = new Blob([content], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHref(url)

        return () => URL.revokeObjectURL(url)
    }, [content])

    return (
        <Anchor
            href={href}
            target={target}
            data-testid="download-link"
            download={filename}
            style={{ display: 'flex', alignItems: 'center' }}
        >
            Download <DownloadSimpleIcon size={16} style={{ marginLeft: 4 }} />
        </Anchor>
    )
}

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

export const JobResults: FC<{ job: LatestJobForStudy }> = ({ job }) => {
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
            else if (isApprovedLogType(f.fileType)) logs.push(f)
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
            <Text fw={650}>{logLabel(file.fileType)}:</Text>
            <ViewResultsLink content={file.contents} />
            <span
                style={{
                    height: 16,
                    borderLeft: `1px solid ${theme.colors.charcoal[4]}`,
                }}
            ></span>
            <DownloadResultsLink target="_blank" filename={file.path} content={file.contents} />
        </Group>
    )
}
