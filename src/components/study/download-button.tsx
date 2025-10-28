import { Button } from '@mantine/core'
import { FC } from 'react'

export const DownloadButton: FC<{ studyId: string; jobId: string }> = () => {
    return <Button>Download result(s)</Button>
}
