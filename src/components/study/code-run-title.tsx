import { FC } from 'react'
import { VisuallyHidden } from '@mantine/core'
import { LocalDateTime } from '@/components/local-date-time'
import { EMPTY_CELL } from '@/lib/dates'

// The bullet is decoration: hidden from screen readers so "Code run • Mar 05, 2026" reads as
// "Code run Mar 05, 2026", like the dots in the Last activity column.
export const CodeRunTitle: FC<{ value: Date | string | null }> = ({ value }) => {
    if (!value) {
        return (
            <>
                Code run<span aria-hidden="true"> • {EMPTY_CELL}</span>
                <VisuallyHidden component="span"> date unknown</VisuallyHidden>
            </>
        )
    }
    return (
        <>
            Code run
            <LocalDateTime
                value={value}
                prefix={
                    <>
                        {' '}
                        <span aria-hidden="true">•</span>{' '}
                    </>
                }
            />
        </>
    )
}
