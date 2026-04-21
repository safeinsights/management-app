import { type RefObject } from 'react'
import { Button } from '@mantine/core'
import { UploadSimpleIcon } from '@phosphor-icons/react/dist/ssr'

interface UploadFilesButtonProps {
    openRef: RefObject<(() => void) | null>
    disabled?: boolean
}

export function UploadFilesButton({ openRef, disabled }: UploadFilesButtonProps) {
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
