'use client'

import { FC } from 'react'
import { Stack, Title, Paper, Divider, Group, Text, Button } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@/common'
import { notifications } from '@mantine/notifications'
import { Routes } from '@/lib/routes'
import { Language } from '@/database/types'
import { Link } from '@/components/links'
import { uploadFiles, type FileUpload } from '@/hooks/upload'
import { onSubmitDraftStudyAction, onDeleteStudyAction } from '@/server/actions/study-request'
import { isActionError, errorToString } from '@/lib/errors'
import { actionResult } from '@/lib/utils'
import logger from '@/lib/logger'
import {
    useStudyRequestStore,
    useCodeFiles,
    getCodeFilesForUpload,
    hasNewCodeFiles,
} from '@/stores/study-request.store'
import type { FileRef } from '@/stores/study-request.store'

interface DetailRowProps {
    label: string
    children: React.ReactNode
}

const DetailRow: FC<DetailRowProps> = ({ label, children }) => (
    <Group gap="xl">
        <Text w={180} c="dimmed" size="sm">
            {label}
        </Text>
        <div>{children}</div>
    </Group>
)

interface FileLinkProps {
    fileRef: FileRef | null
}

const FileLink: FC<FileLinkProps> = ({ fileRef }) => {
    if (!fileRef) {
        return <Text c="dimmed">Not uploaded</Text>
    }
    const name = fileRef.type === 'memory' ? fileRef.file.name : fileRef.name
    return (
        <Group gap="xs">
            <Text size="sm" c="blue">
                {name}
            </Text>
        </Group>
    )
}

const getFileName = (f: FileRef): string => (f.type === 'memory' ? f.file.name : f.name)

interface SubmissionReviewProps {
    studyId: string
    orgSlug: string
    submittingOrgSlug: string
    title: string
    piName: string
    language: Language
    existingDocuments?: {
        description?: string | null
        irb?: string | null
        agreement?: string | null
    }
}

export const SubmissionReview: FC<SubmissionReviewProps> = ({
    studyId,
    orgSlug,
    submittingOrgSlug,
    title,
    piName,
    language,
    existingDocuments,
}) => {
    const router = useRouter()
    const queryClient = useQueryClient()

    // Zustand store
    const store = useStudyRequestStore()
    const codeFiles = useCodeFiles()
    const documentFiles = store.documentFiles

    const mainFileName = codeFiles.mainFile ? getFileName(codeFiles.mainFile) : null
    const additionalFileNames = codeFiles.additionalFiles.map(getFileName)

    const { isPending: isSubmitting, mutate: submitStudy } = useMutation({
        mutationFn: async () => {
            // Determine file names (either from memory or existing)
            const finalMainFileName = mainFileName
            const finalAdditionalFileNames = additionalFileNames

            if (!finalMainFileName) {
                throw new Error('Missing required code file. Please upload the main code file.')
            }

            // Submit the draft study - this creates the study job and returns code upload URL
            const { studyId: submittedStudyId, urlForCodeUpload } = actionResult(
                await onSubmitDraftStudyAction({
                    studyId,
                    mainCodeFileName: finalMainFileName,
                    codeFileNames: finalAdditionalFileNames,
                }),
            )

            // Upload code files if we have new ones in memory
            if (hasNewCodeFiles(codeFiles)) {
                const { main, additional } = getCodeFilesForUpload(codeFiles)
                const filesToUpload: FileUpload[] = []

                if (main) {
                    filesToUpload.push([main, urlForCodeUpload])
                }
                additional.forEach((f) => {
                    filesToUpload.push([f, urlForCodeUpload])
                })

                if (filesToUpload.length > 0) {
                    try {
                        await uploadFiles(filesToUpload)
                    } catch (err: unknown) {
                        // Clean up on failure
                        const result = await onDeleteStudyAction({ studyId: submittedStudyId })
                        if (isActionError(result)) {
                            logger.error(
                                `Failed to remove temp study details after upload failure: ${errorToString(result.error)}`,
                            )
                        }
                        throw err
                    }
                }
            }

            return { studyId: submittedStudyId }
        },
        onSuccess() {
            // Clean up store
            store.reset()

            // Invalidate caches
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
        onError: async (error) => {
            notifications.show({
                color: 'red',
                title: 'Failed to submit study',
                message: `${errorToString(error)}\nPlease contact support.`,
            })
        },
    })

    const handleBackToCode = () => {
        router.push(Routes.studyCode({ orgSlug: submittingOrgSlug, studyId }))
    }

    return (
        <>
            <Stack gap="xl">
                <Title order={1}>Review your submission</Title>

                <Paper bg="white" p="xxl">
                    <Stack>
                        <Group justify="space-between" align="center">
                            <Title order={4} size="xl">
                                Data Organization
                            </Title>
                        </Group>
                        <Divider c="dimmed" />
                        <DetailRow label="Data Organization">{orgSlug || 'Not specified'}</DetailRow>
                    </Stack>
                </Paper>

                <Paper bg="white" p="xxl">
                    <Stack>
                        <Group justify="space-between" align="center">
                            <Title order={4} size="xl">
                                Study Proposal
                            </Title>
                            <Link href={Routes.studyEdit({ orgSlug: submittingOrgSlug, studyId })}>Edit</Link>
                        </Group>
                        <Divider c="dimmed" />
                        <Stack gap="sm">
                            <DetailRow label="Study title">{title || 'Not specified'}</DetailRow>
                            <DetailRow label="Principal Investigator">{piName || 'Not specified'}</DetailRow>
                            <DetailRow label="Study description">
                                <FileLink fileRef={documentFiles.description} />
                                {!documentFiles.description && existingDocuments?.description && (
                                    <Text size="sm" c="blue">
                                        {existingDocuments.description}
                                    </Text>
                                )}
                            </DetailRow>
                            <DetailRow label="IRB document">
                                <FileLink fileRef={documentFiles.irb} />
                                {!documentFiles.irb && existingDocuments?.irb && (
                                    <Text size="sm" c="blue">
                                        {existingDocuments.irb}
                                    </Text>
                                )}
                            </DetailRow>
                            <DetailRow label="Agreement document">
                                <FileLink fileRef={documentFiles.agreement} />
                                {!documentFiles.agreement && existingDocuments?.agreement && (
                                    <Text size="sm" c="blue">
                                        {existingDocuments.agreement}
                                    </Text>
                                )}
                            </DetailRow>
                        </Stack>
                    </Stack>
                </Paper>

                <Paper bg="white" p="xxl">
                    <Stack>
                        <Group justify="space-between" align="center">
                            <Title order={4} size="xl">
                                Programming Language
                            </Title>
                        </Group>
                        <Divider c="dimmed" />
                        <DetailRow label="Programming language">{language || 'Not specified'}</DetailRow>
                    </Stack>
                </Paper>

                <Paper bg="white" p="xxl">
                    <Stack>
                        <Group justify="space-between" align="center">
                            <Title order={4} size="xl">
                                Study Code
                            </Title>
                            <Link href={Routes.studyCode({ orgSlug: submittingOrgSlug, studyId })}>Edit</Link>
                        </Group>
                        <Divider c="dimmed" />
                        <Stack gap="sm">
                            <DetailRow label="Main code file">
                                {mainFileName ? (
                                    <Text size="sm" c="blue">
                                        {mainFileName}
                                    </Text>
                                ) : (
                                    <Text c="dimmed">Not uploaded</Text>
                                )}
                            </DetailRow>
                            {additionalFileNames.length > 0 && (
                                <DetailRow label="Additional file(s)">
                                    <Group gap="md">
                                        {additionalFileNames.map((name) => (
                                            <Text key={name} size="sm" c="blue">
                                                {name}
                                            </Text>
                                        ))}
                                    </Group>
                                </DetailRow>
                            )}
                        </Stack>
                    </Stack>
                </Paper>
            </Stack>

            <Group mt="xxl" style={{ width: '100%' }}>
                <Group style={{ marginLeft: 'auto' }}>
                    <Button
                        type="button"
                        size="md"
                        variant="subtle"
                        onClick={handleBackToCode}
                        leftSection={<CaretLeftIcon />}
                        disabled={isSubmitting}
                    >
                        Previous
                    </Button>
                    <Button
                        type="button"
                        variant="primary"
                        size="md"
                        disabled={!mainFileName || isSubmitting}
                        loading={isSubmitting}
                        onClick={() => submitStudy()}
                    >
                        Submit study
                    </Button>
                </Group>
            </Group>
        </>
    )
}
