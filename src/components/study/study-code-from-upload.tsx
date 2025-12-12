'use client'

import { useUploadedFiles } from '@/hooks/use-uploaded-files'
import { Box, Button, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { FileReviewTable } from './file-review-table'

interface StudyCodeFromUploadProps {
    studyId: string
    orgSlug: string
}

export const StudyCodeFromUpload = ({ studyId, orgSlug }: StudyCodeFromUploadProps) => {
    const { fileNames, mainFile, hasFiles, canSubmit, isSubmitting, setMainFile, removeFile, submit, goBack } =
        useUploadedFiles({ studyId, orgSlug })

    return (
        <>
            <Title order={1}>Review files to submit</Title>

            <Paper p="xl">
                <Text fz="sm" fw={700} c="gray.6" pb="sm">
                    STEP 5 of 5
                </Text>
                <Title order={4}>Study code</Title>
                <Divider my="sm" mt="sm" mb="md" />

                <Text fw={600} mb="md">
                    Review uploaded files
                </Text>

                {!hasFiles ? (
                    <Box bg="yellow.1" p="md" style={{ borderRadius: 8 }}>
                        <Text c="yellow.9" fw={500}>
                            Your files were lost due to page refresh. Please go back and re-upload your files.
                        </Text>
                        <Button variant="outline" mt="md" onClick={goBack}>
                            Back to upload
                        </Button>
                    </Box>
                ) : fileNames.length > 0 ? (
                    <FileReviewTable
                        files={fileNames}
                        mainFile={mainFile}
                        onMainFileChange={setMainFile}
                        onRemoveFile={removeFile}
                    />
                ) : (
                    <Box bg="gray.1" py={60} style={{ borderRadius: 8 }}>
                        <Stack align="center" gap="md">
                            <Text c="dimmed">No files uploaded.</Text>
                        </Stack>
                    </Box>
                )}
            </Paper>

            <Group justify="space-between">
                <Button variant="subtle" leftSection={<CaretLeftIcon />} onClick={goBack} disabled={isSubmitting}>
                    Back to upload
                </Button>

                <Button variant="primary" disabled={!canSubmit} loading={isSubmitting} onClick={() => submit()}>
                    Submit Study
                </Button>
            </Group>
        </>
    )
}
