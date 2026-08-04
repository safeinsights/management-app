'use client'

import { Button, Loader, VisuallyHidden } from '@mantine/core'
import { FC } from 'react'

interface SecurityKeyViewButtonProps {
    isDecrypting: boolean
    isLoading?: boolean
    onClick: () => void
}

export const SecurityKeyViewButton: FC<SecurityKeyViewButtonProps> = ({ isDecrypting, isLoading, onClick }) => {
    const label = isDecrypting ? 'Decrypting' : isLoading ? 'Loading' : 'View'
    const disabled = isDecrypting || isLoading

    return (
        <div>
            <Button
                size="sm"
                onClick={onClick}
                disabled={disabled}
                leftSection={disabled ? <Loader size={14} color="var(--mantine-color-charcoal-6)" /> : undefined}
                bg={disabled ? 'grey.1' : undefined}
                c={disabled ? 'charcoal.6' : undefined}
                styles={disabled ? { root: { opacity: 1 } } : undefined}
            >
                {label}
            </Button>
            <VisuallyHidden role="status" aria-live="polite">
                {label + ' outputs'}
            </VisuallyHidden>
        </div>
    )
}
