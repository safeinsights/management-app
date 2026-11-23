'use client'

import { Button, Loader, VisuallyHidden } from '@mantine/core'
import { FC } from 'react'
import { semanticColor } from '@/theme/tokens'

interface SecurityKeyViewButtonProps {
    isDecrypting: boolean
    isLoading?: boolean
    idleLabel?: string
    onClick: () => void
}

export const SecurityKeyViewButton: FC<SecurityKeyViewButtonProps> = ({
    isDecrypting,
    isLoading,
    idleLabel = 'View',
    onClick,
}) => {
    const disabled = isDecrypting || isLoading
    const busyLabel = isDecrypting ? 'Decrypting' : 'Loading'
    const label = disabled ? busyLabel : idleLabel

    return (
        <div>
            <Button
                size="sm"
                onClick={onClick}
                disabled={disabled}
                leftSection={disabled ? <Loader size={14} color={semanticColor('text.disabled')} /> : undefined}
            >
                {label}
            </Button>
            <VisuallyHidden role="status" aria-live="polite">
                {disabled ? busyLabel + ' outputs' : undefined}
            </VisuallyHidden>
        </div>
    )
}
