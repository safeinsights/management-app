import { type RefObject } from 'react'
import { Button } from '@mantine/core'
import { UploadSimpleIcon } from '@phosphor-icons/react/dist/ssr'

interface UploadFilesButtonProps {
    openRef: RefObject<(() => void) | null>
    disabled?: boolean
    /** Defaults to visible so /resubmit's panel, which always shows it, needs no change. */
    isVisible?: boolean
}

export function UploadFilesButton({ openRef, disabled, isVisible = true }: UploadFilesButtonProps) {
    if (!isVisible) return null

    return (
        <Button
            variant="outline"
            leftSection={<UploadSimpleIcon size={16} />}
            disabled={disabled}
            onClick={() => openRef.current?.()}
        >
            Upload files
        </Button>
    )
}
