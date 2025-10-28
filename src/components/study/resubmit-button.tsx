import { Button } from '@mantine/core'
import { Link } from '../links'

export const ResubmitButton = ({ studyId, orgSlug }: { studyId: string; orgSlug: string }) => {
    return (
        <Button component={Link} href={`/${orgSlug}/study/${studyId}/resubmit`}>
            + Resubmit study code
        </Button>
    )
}
