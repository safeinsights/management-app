'use client'

import { Button, Loader, VisuallyHidden } from '@mantine/core'
import { FC } from 'react'

interface SecurityKeyViewButtonProps {
    isDecrypting: boolean
    onClick: () => void
}

export const SecurityKeyViewButton: FC<SecurityKeyViewButtonProps> = ({ isDecrypting, onClick }) => (
    <div>
        <Button
            size="sm"
            onClick={onClick}
            disabled={isDecrypting}
            leftSection={isDecrypting ? <Loader size={14} color="var(--mantine-color-charcoal-6)" /> : undefined}
            bg={isDecrypting ? 'grey.1' : undefined}
            c={isDecrypting ? 'charcoal.6' : undefined}
            styles={isDecrypting ? { root: { opacity: 1 } } : undefined}
        >
            {isDecrypting ? 'Decrypting' : 'View'}
        </Button>
        <VisuallyHidden role="status" aria-live="polite">
            {isDecrypting ? 'Decrypting outputs' : ''}
        </VisuallyHidden>
    </div>
)
