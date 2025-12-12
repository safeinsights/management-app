'use client'

import { useMutation, useQuery, useQueryClient } from '@/common'
import { StudyCodeFromIDE } from '@/components/study/study-code-from-ide'
import { AlertNotFound } from '@/components/errors'
import { Routes } from '@/lib/routes'
import { errorToString } from '@/lib/errors'
import { Button, Group, Stack, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { getDraftStudyAction, submitStudyFromIDEAction } from '../../request/actions'

export default function StudySelectFilesPage() {
    const router = useRouter()
    const queryClient = useQueryClient()
    const { orgSlug, studyId } = useParams<{ orgSlug: string; studyId: string }>()
    const [ideMainFile, setIdeMainFile] = useState('')
    const [ideFiles, setIdeFiles] = useState<string[]>([])

    const { data: study, isLoading } = useQuery({
        queryKey: ['draft-study', studyId],
        queryFn: () => getDraftStudyAction({ studyId }),
        enabled: !!studyId,
    })

    const handleIDEFilesChange = useCallback(({ mainFile, files }: { mainFile: string; files: string[] }) => {
        setIdeMainFile(mainFile)
        setIdeFiles(files)
    }, [])

    const { isPending: isSubmitting, mutate: submitStudy } = useMutation({
        mutationFn: async () => {
            if (!studyId || !ideMainFile || ideFiles.length === 0) {
                throw new Error('Study ID, main file, or files not set')
            }
            const result = await submitStudyFromIDEAction({
                studyId,
                mainFileName: ideMainFile,
                fileNames: ideFiles,
            })
            if ('error' in result) {
                throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error))
            }
            return result
        },
        onSuccess() {
            queryClient.invalidateQueries({ queryKey: ['researcher-studies'] })
            queryClient.invalidateQueries({ queryKey: ['user-researcher-studies'] })
            notifications.show({
                title: 'Study Proposal Submitted',
                message:
                    'Your proposal has been successfully submitted to the reviewing organization. Check your dashboard for status updates.',
                color: 'green',
            })
            router.push(Routes.dashboard)
        },
        onError: (error) => {
            notifications.show({
                color: 'red',
                title: 'Failed to submit study',
                message: `${errorToString(error)}\nPlease contact support.`,
            })
        },
    })

    if (isLoading) {
        return (
            <Stack p="xl">
                <Title order={1}>Loading...</Title>
            </Stack>
        )
    }

    if (!study || 'error' in study) {
        return <AlertNotFound title="Study not found" message="This study does not exist or is not a draft." />
    }

    const canSubmit = ideMainFile && ideFiles.length > 0

    return (
        <Stack p="xl" gap="xl">
            <Title order={1}>Select files to submit</Title>

            <StudyCodeFromIDE studyId={studyId} onChange={handleIDEFilesChange} />

            <Group justify="space-between">
                <Button
                    variant="subtle"
                    leftSection={<CaretLeftIcon />}
                    onClick={() => router.push(Routes.studyUpload({ orgSlug, studyId }))}
                    disabled={isSubmitting}
                >
                    Back to upload
                </Button>

                <Button variant="primary" disabled={!canSubmit} loading={isSubmitting} onClick={() => submitStudy()}>
                    Submit Study
                </Button>
            </Group>
        </Stack>
    )
}
