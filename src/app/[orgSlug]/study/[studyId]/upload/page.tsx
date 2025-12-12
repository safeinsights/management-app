'use client'

import { useQuery } from '@/common'
import { StudyCodeUpload } from '@/components/study-code-upload'
import { AlertNotFound } from '@/components/errors'
import { Language } from '@/database/types'
import { Routes } from '@/lib/routes'
import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { getDraftStudyAction } from '../../request/actions'
import { StudyJobCodeFilesValues } from '@/schema/study-proposal'

export default function StudyUploadPage() {
    const router = useRouter()
    const { orgSlug, studyId } = useParams<{ orgSlug: string; studyId: string }>()
    const [ideLaunched, setIdeLaunched] = useState(false)
    const [ideLaunchLoading, setIdeLaunchLoading] = useState(false)

    const studyUploadForm = useForm<StudyJobCodeFilesValues>({
        initialValues: {
            mainCodeFile: null,
            additionalCodeFiles: [],
        },
    })

    const { data: study, isLoading } = useQuery({
        queryKey: ['draft-study', studyId],
        queryFn: () => getDraftStudyAction({ studyId }),
        enabled: !!studyId,
    })

    if (isLoading) {
        return (
            <Stack p="xl">
                <Text>Loading...</Text>
            </Stack>
        )
    }

    if (!study || 'error' in study) {
        return <AlertNotFound title="Study not found" message="This study does not exist or is not a draft." />
    }

    const handleProceedToSelectFiles = () => {
        router.push(Routes.studySelectFiles({ orgSlug, studyId }))
    }

    return (
        <Stack p="xl" gap="xl">
            <Title order={1}>Upload study code</Title>
            <Paper>
                <StudyCodeUpload
                    studyUploadForm={studyUploadForm}
                    stepIndicator="Step 4 of 5"
                    title="Study code"
                    orgSlug={study.orgSlug || orgSlug}
                    language={(study.language as Language) || 'PYTHON'}
                    studyId={studyId}
                    onIDELaunched={() => setIdeLaunched(true)}
                    onIDELoadingChange={setIdeLaunchLoading}
                />
            </Paper>

            <Group justify="space-between">
                <Button
                    variant="subtle"
                    leftSection={<CaretLeftIcon />}
                    onClick={() => router.push(Routes.studyEdit({ orgSlug, studyId }))}
                >
                    Back to study details
                </Button>

                {ideLaunched && (
                    <Button
                        variant="primary"
                        disabled={ideLaunchLoading}
                        onClick={handleProceedToSelectFiles}
                    >
                        Proceed to select files
                    </Button>
                )}
            </Group>
        </Stack>
    )
}
