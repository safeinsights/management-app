'use client'

import { isActionError, errorToString } from '@/lib/errors'
import { uploadClaudeContextAction } from '@/server/actions/claude-context.actions'
import { Box, Group, Stack, Title, Text, FileButton, Button } from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import { notifications } from '@mantine/notifications'
import { FileArrowUpIcon, UploadIcon } from '@phosphor-icons/react/dist/ssr'
import { useRef, useState } from 'react'

export function ClaudeContext() {
    const [isUploading, setIsUploading] = useState(false)
    const resetRef = useRef<() => void>(null)

    const onChange = async (file: File | null) => {
        if (!file) return

        setIsUploading(true)

        try {
            const result = await uploadClaudeContextAction({ file: file })
            if (isActionError(result)) {
                notifications.show({
                    color: 'red',
                    title: 'Upload failed',
                    message: errorToString(result),
                    autoClose: false
                })
                return
            }
            notifications.show({
                color: 'green',
                title: 'Uploaded',
                message: 'system.md updated',
            })
        } catch (err) {
            notifications.show({
                color: 'red',
                title: 'Upload failed',
                message: errorToString(err),
                autoClose: false
            })
        } finally {
            setIsUploading(false)
            resetRef.current?.() // clear file input history
        }
    }

    return (
        <Box style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
            <Title>System and Language Context for Claude</Title>
            <Stack p="md">
                Edit system context:
                <FileButton onChange={onChange} resetRef={resetRef} accept=".md,text/markdown" disabled={isUploading}>
                    {(props) => <Button {...props} loading={isUploading}>
                        <FileArrowUpIcon />Upload system.md
                    </Button>}
                </FileButton>
            </Stack>
        </Box>
    )
}
