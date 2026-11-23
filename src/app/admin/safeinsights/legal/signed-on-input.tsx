'use client'

import type { FC } from '@/common'
import { TextInput } from '@mantine/core'
import dayjs from 'dayjs'
import { useIsHydrated } from '@/hooks/use-is-hydrated'

const todayLocal = () => dayjs().format('YYYY-MM-DD')

// Kept a plain YYYY-MM-DD string; a Date would land a day early west of the server.
export const SignedOnInput: FC<{ value: string; onChange: (value: string) => void; error?: string }> = ({
    value,
    onChange,
    error,
}) => {
    // React keeps a server-rendered attribute through hydration, so the limit waits for the admin's own day.
    const isHydrated = useIsHydrated()

    return (
        <TextInput
            type="date"
            label="Signed on"
            description="The date the signatories signed the agreement"
            value={value}
            // Honored by the picker only, not manual entry. Stricter than schema (doesn't allow +1 day).
            max={isHydrated ? todayLocal() : undefined}
            error={error}
            onChange={(event) => onChange(event.currentTarget.value)}
        />
    )
}
