'use client'

import { FC } from 'react'
import { Paper, Stack, Title } from '@mantine/core'
import { StudyCodeSection } from '@/app/researcher/study/request/[orgSlug]/upload-study-job-code'
import { Button, Group } from '@mantine/core'
import Link from 'next/link'
import { z } from 'zod'
import { useForm } from '@mantine/form'
import { zodResolver } from 'mantine-form-zod-resolver'
import { StudyProposalFormValues } from '../../request/[orgSlug]/study-proposal-form-schema'

const ResubmitStudyJobCodeSchema = z.object({
    mainCodeFile: z.instanceof(File).nullable(),
    additionalCodeFiles: z.array(z.instanceof(File)),
})

export type ResubmitStudyJobCodeValues = z.infer<typeof ResubmitStudyJobCodeSchema>

const ResubmitPage: FC = () => {
    const form = useForm<StudyProposalFormValues>({
        validate: zodResolver(ResubmitStudyJobCodeSchema),
    })

    return (
        <Paper p="xl">
            <Stack>
                <Title order={2}>Resubmit study code</Title>
                <StudyCodeSection studyProposalForm={form} />
                <Group justify="flex-end">
                    <Button variant="default" component={Link} href="/researcher/dashboard">
                        Cancel
                    </Button>
                    <Button>Resubmit study code</Button>
                </Group>
            </Stack>
        </Paper>
    )
}

export default ResubmitPage
