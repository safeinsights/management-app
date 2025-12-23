'use client'

import { FC } from 'react'
import { Stack, Title, Paper, Divider, Group, Text, Button } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'
import { Routes } from '@/lib/routes'
import { Language } from '@/database/types'
import { Link } from '@/components/links'
import { useStudyRequest } from '@/contexts/study-request'
import { getFileName, type FileRef } from '@/contexts/shared/file-types'

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
    fallbackPath?: string | null
}

const FileDisplay: FC<FileLinkProps> = ({ fileRef, fallbackPath }) => {
    if (fileRef) {
        return (
            <Text size="sm" c="blue">
                {getFileName(fileRef)}
            </Text>
        )
    }
    if (fallbackPath) {
        return (
            <Text size="sm" c="blue">
                {fallbackPath}
            </Text>
        )
    }
    return <Text c="dimmed">Not uploaded</Text>
}

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
    const { documentFiles, mainFileName, additionalFileNames, canSubmit, submitStudy, isSubmitting } = useStudyRequest()

    const handleBackToCode = () => {
        router.push(Routes.studyCode({ orgSlug: submittingOrgSlug, studyId }))
    }

    return (
        <>
            <Stack gap="xl">
                <Title order={1}>Review your submission</Title>

                <Paper bg="white" p="xxl">
                    <Stack>
                        <Title order={4} size="xl">
                            Data Organization
                        </Title>
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
                                <FileDisplay
                                    fileRef={documentFiles.description}
                                    fallbackPath={existingDocuments?.description}
                                />
                            </DetailRow>
                            <DetailRow label="IRB document">
                                <FileDisplay fileRef={documentFiles.irb} fallbackPath={existingDocuments?.irb} />
                            </DetailRow>
                            <DetailRow label="Agreement document">
                                <FileDisplay
                                    fileRef={documentFiles.agreement}
                                    fallbackPath={existingDocuments?.agreement}
                                />
                            </DetailRow>
                        </Stack>
                    </Stack>
                </Paper>

                <Paper bg="white" p="xxl">
                    <Stack>
                        <Title order={4} size="xl">
                            Programming Language
                        </Title>
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
                        disabled={!canSubmit || isSubmitting}
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
