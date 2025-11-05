import { Button } from '@mantine/core'
import { Link } from '../links'
import { Routes } from '@/lib/routes'

export const ResubmitButton = ({ studyId }: { studyId: string }) => {
    return (
        <Button component={Link} href={`/researcher/study/${studyId}/resubmit`}>
            + Resubmit study code
        </Button>
    )
}
