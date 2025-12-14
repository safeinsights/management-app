'use client'

import { useQuery, useMutation } from '@/common'
import { StudyCodeUpload } from '@/components/study-code-upload'
import { AlertNotFound } from '@/components/errors'
import { Language } from '@/database/types'
import { Routes } from '@/lib/routes'
import { uploadFiles, type FileUpload } from '@/hooks/upload'
import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { getDraftStudyAction, addJobToStudyAction } from '@/server/actions/study-request'
import { StudyJobCodeFilesValues } from '@/schema/study-proposal'
import { errorToString } from '@/lib/errors'

export default function StudyUploadPage() {
    const router = useRouter()
    const { orgSlug, studyId } = useParams<{ orgSlug: string; studyId: string }>()
    const [ideLaunched, setIdeLaunched] = useState(false)
    const [ideLaunchLoading, setIdeLaunchLoading] = useState(false)
    const [codeUploadViewMode, setCodeUploadViewMode] = useState<'upload' | 'review'>('upload')
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([])

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

    const { isPending: isSubmitting, mutate: submitCodeFiles } = useMutation({
        mutationFn: async ({ files, mainFile }: { files: File[]; mainFile: string }) => {
            const additionalFileNames = files.filter((f) => f.name !== mainFile).map((f) => f.name)

            // Create study job and get upload URL
            const result = await addJobToStudyAction({
                studyId,
                mainCodeFileName: mainFile,
                codeFileNames: additionalFileNames,
            })

            if ('error' in result) {
                const errorMsg =
                    typeof result.error === 'string' ? result.error : result.error?.user || 'Failed to create study job'
                throw new Error(errorMsg)
            }

            // Upload all files to S3
            const fileUploads: FileUpload[] = files.map((file) => [file, result.urlForCodeUpload])
            await uploadFiles(fileUploads)

            return result
        },
        onSuccess: () => {
            notifications.show({
                title: 'Code uploaded',
                message: 'Your code files have been uploaded successfully.',
                color: 'green',
            })
            router.push(Routes.studyReview({ orgSlug, studyId }))
        },
        onError: (error) => {
            notifications.show({
                color: 'red',
                title: 'Failed to upload code',
                message: errorToString(error),
            })
        },
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

    const handleFilesUploaded = (files: File[]) => {
        setUploadedFiles(files)
    }

    const handleProceedToReview = (selectedMainFile: string) => {
        // Upload files to server and navigate to review page
        submitCodeFiles({ files: uploadedFiles, mainFile: selectedMainFile })
    }

    const handleProceedFromIDE = () => {
        router.push(Routes.studySelectFiles({ orgSlug, studyId }))
    }

    // Hide the bottom navigation when in review mode (ReviewUploadedFiles has its own buttons)
    const showBottomNavigation = codeUploadViewMode === 'upload'

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
                    viewMode={codeUploadViewMode}
                    onViewModeChange={setCodeUploadViewMode}
                    onFilesUploaded={handleFilesUploaded}
                    onProceed={handleProceedToReview}
                    isSubmitting={isSubmitting}
                />
            </Paper>

            {showBottomNavigation && (
                <Group justify="space-between">
                    <Button
                        variant="subtle"
                        leftSection={<CaretLeftIcon />}
                        onClick={() => router.push(Routes.studyEdit({ orgSlug, studyId }))}
                    >
                        Back to study details
                    </Button>

                    {ideLaunched && (
                        <Button variant="outline" disabled={ideLaunchLoading} onClick={handleProceedFromIDE}>
                            Proceed to select files from IDE
                        </Button>
                    )}
                </Group>
            )}
        </Stack>
    )
}
