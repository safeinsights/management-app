import { Button } from '@mantine/core'
import type { Route } from 'next'
import { Link } from '../links'

export const ResubmitButton = ({ studyId, orgSlug }: { studyId: string; orgSlug: string }) => {
    return (
        <Button component={Link} href={`/${orgSlug}/study/${studyId}/resubmit` as Route}>
            + Resubmit study code
        </Button>
    )
}
