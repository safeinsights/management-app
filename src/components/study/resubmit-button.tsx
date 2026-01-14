'use client'

import { Button } from '@mantine/core'
import NextLink from 'next/link'
import { Routes } from '@/lib/routes'

export const ResubmitButton = ({ studyId, orgSlug }: { studyId: string; orgSlug: string }) => {
    return (
        <Button component={NextLink} href={Routes.studyResubmit({ orgSlug, studyId })}>
            + Resubmit study code
        </Button>
    )
}
