'use client'

import { useRef, useState, type ReactNode, type DragEvent, type RefObject } from 'react'
import { Anchor, Box, Paper, Stack, Text, ThemeIcon } from '@mantine/core'
import { Dropzone, type FileWithPath } from '@mantine/dropzone'
import { notifications } from '@mantine/notifications'
import { FileArrowUpIcon } from '@phosphor-icons/react/dist/ssr'
import { ACCEPTED_FILE_TYPES, ACCEPTED_FILE_FORMATS_TEXT } from '@/lib/types'

const ACCEPTED_EXTENSIONS = new Set(
    Object.values(ACCEPTED_FILE_TYPES)
        .flat()
        .map((ext) => ext.toLowerCase()),
)

function hasAcceptedExtension(fileName: string) {
    const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
    return ACCEPTED_EXTENSIONS.has(ext)
}

function DragOverlayBanner({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Box
            pos="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            bg="rgba(0, 0, 0, 0.45)"
            style={{
                zIndex: 10,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
            }}
        >
            <Paper p="lg" radius="md" shadow="md">
                <Stack align="center" gap="xs">
                    <ThemeIcon variant="light" color="blue" size="xl" radius="xl">
                        <FileArrowUpIcon size={28} />
                    </ThemeIcon>
                    <Text fw={600} size="md">
                        Drop files to include
                    </Text>
                    <Text size="xs" c="dimmed">
                        {ACCEPTED_FILE_FORMATS_TEXT}
                    </Text>
                </Stack>
            </Paper>
        </Box>
    )
}

function HelperText({ isVisible, openRef }: { isVisible: boolean; openRef: RefObject<(() => void) | null> }) {
    if (!isVisible) return null
    return (
        <Text fs="italic" size="sm" c="dimmed" mt="xs">
            Include additional files by dropping them above or by{' '}
            <Anchor component="button" type="button" size="sm" fs="italic" onClick={() => openRef.current?.()}>
                clicking here
            </Anchor>
            .
        </Text>
    )
}

interface FileDropOverlayProps {
    onDrop: (files: FileWithPath[]) => void
    children: ReactNode
    disabled?: boolean
    showHelperText?: boolean
    openRef?: RefObject<(() => void) | null>
}

export function FileDropOverlay({
    onDrop,
    children,
    disabled,
    showHelperText = true,
    openRef: externalOpenRef,
}: FileDropOverlayProps) {
    const internalOpenRef = useRef<() => void>(null)
    const openRef = externalOpenRef ?? internalOpenRef
    const [isDragging, setIsDragging] = useState(false)
    const dragCounter = useRef(0)

    const handleDragEnter = (e: DragEvent) => {
        e.preventDefault()
        dragCounter.current++
        if (dragCounter.current === 1) setIsDragging(true)
    }

    const handleDragLeave = (e: DragEvent) => {
        e.preventDefault()
        dragCounter.current--
        if (dragCounter.current === 0) setIsDragging(false)
    }

    const handleDragDrop = () => {
        dragCounter.current = 0
        setIsDragging(false)
    }

    const handleDrop = (files: FileWithPath[]) => {
        const accepted = files.filter((f) => hasAcceptedExtension(f.name))
        const rejected = files.filter((f) => !hasAcceptedExtension(f.name))

        if (rejected.length > 0) {
            notifications.show({
                color: 'red',
                title: 'Unsupported file type',
                message: `${rejected.map((f) => f.name).join(', ')} — ${ACCEPTED_FILE_FORMATS_TEXT}`,
            })
        }

        if (accepted.length > 0) {
            onDrop(accepted)
        }
    }

    return (
        <Box pos="relative" onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDrop={handleDragDrop}>
            <Dropzone
                openRef={openRef}
                onDrop={handleDrop}
                accept={ACCEPTED_FILE_TYPES}
                activateOnClick={false}
                disabled={disabled}
                styles={{
                    root: {
                        border: 'none',
                        padding: 0,
                        backgroundColor: 'transparent',
                        color: 'inherit',
                    },
                    inner: { pointerEvents: 'all' },
                }}
            >
                {children}
            </Dropzone>

            <DragOverlayBanner isVisible={isDragging && !disabled} />

            <HelperText isVisible={showHelperText} openRef={openRef} />
        </Box>
    )
}
