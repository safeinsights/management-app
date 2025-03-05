'use client'
import { useCallback, useState } from 'react'
import { Flex, Group, Paper, rem, Text, Stack, Divider, Button, FileButton } from '@mantine/core'
import { Code, Upload, X } from '@phosphor-icons/react/dist/ssr'
import { Dropzone, DropzoneProps, type FileWithPath } from '@mantine/dropzone'
import { UploadSimple } from '@phosphor-icons/react/dist/ssr'
import type { MinimalJobInfo } from '@/lib/types'
import { CodeReviewManifest } from '@/lib/code-manifest'
import { notifications } from '@mantine/notifications'

type PreSignedPost = {
    url: string
    fields: Record<string, string>
}

type SignedUrlFunc = (_job: MinimalJobInfo) => Promise<PreSignedPost>

type UploadStudyJobCodeProps = Partial<DropzoneProps> & {
    job: MinimalJobInfo
    getSignedURL: SignedUrlFunc
}

async function uploadFile(file: FileWithPath, upload: PreSignedPost) {
    const body = new FormData()
    for (const [key, value] of Object.entries(upload.fields)) {
        body.append(key, value)
    }
    body.append('file', file)

    const response = await fetch(upload.url, {
        method: 'POST',
        body,
    })
    if (!response.ok) {
        notifications.show({
            color: 'red',
            title: 'failed to upload file',
            message: await response.text(),
        })
    }
    return response.ok
}

async function uploadFilesToS3(files: FileWithPath[], job: MinimalJobInfo, getSignedUrl: SignedUrlFunc) {
    const manifest = new CodeReviewManifest(job.studyJobId, 'r')

    const post = await getSignedUrl(job)
    let allSuccess = true
    for (const file of files) {
        manifest.files.push(file)
        if (!(await uploadFile(file, post))) allSuccess = false
    }
    // TODO Re: This note, couldn't we just sort the files and place manifest.json last?
    // the manifiest MUST BE UPLOADED LAST. it's presence signals the end of the upload and triggers the docker container build
    const file = new File([manifest.asJSON], 'manifest.json', { type: 'application/json' })
    if (!(await uploadFile(file, post))) allSuccess = false
    return allSuccess
}

export function UploadStudyJobCode({ job, getSignedURL, ...dzProps }: UploadStudyJobCodeProps) {
    const [uploadState, setUploading] = useState<false | 'uploading' | 'complete'>(false)

    const onDrop = useCallback(
        async (files: FileWithPath[]) => {
            setUploading('uploading')
            const success = await uploadFilesToS3(files, job, getSignedURL)
            if (success) setUploading('complete')
        },
        [setUploading, getSignedURL, job],
    )

    if (uploadState == 'complete') {
        return (
            <Paper shadow="none" mt={30} radius="sm" withBorder p="xl">
                <Flex gap="lg">
                    <Code size={70} />
                    <Flex direction={'column'} justify="space-around">
                        <h4>Uploaded files</h4>
                        <p>All files were uploaded successfully</p>
                    </Flex>
                </Flex>
            </Paper>
        )
    }

    const [files, setFiles] = useState<File[]>([])

    return (
        <>
            <Dropzone
                w="50%"
                onDrop={onDrop}
                onReject={(rejections) =>
                    notifications.show({
                        color: 'red',
                        title: 'rejected files',
                        message: rejections
                            .map(
                                (rej) =>
                                    `${rej.file.name} ${rej.errors.map((err) => `${err.code}: ${err.message}`).join(', ')}`,
                            )
                            .join('\n'),
                    })
                }
                {...dzProps}
                loading={uploadState === 'uploading'}
                multiple={false}
            >
                <Stack align="center" justify="center" gap="md" mih={120} style={{ pointerEvents: 'none' }}>
                    <Dropzone.Accept>
                        <Upload style={{ width: rem(52), height: rem(52), color: 'var(--mantine-color-blue-6)' }} />
                    </Dropzone.Accept>
                    <Dropzone.Reject>
                        <X style={{ width: rem(52), height: rem(52), color: 'var(--mantine-color-red-6)' }} />
                    </Dropzone.Reject>
                    <Dropzone.Idle>
                        <UploadSimple size={32} />
                    </Dropzone.Idle>
                    <div>
                        <Text size="md" mb="sm" inline>
                            Drop files here.
                        </Text>
                    </div>
                </Stack>
                <Divider my="xl" label="Or" labelPosition="center" />
                <Group justify="center">
                    <FileButton mb={10} onChange={setFiles} accept="image/png,image/jpeg" multiple>
                        {(props) => (
                            <Button {...props} variant="outline" color="#616161">
                                Upload
                            </Button>
                        )}
                    </FileButton>
                </Group>
            </Dropzone>
            <div>
                <Stack gap="xs" pl={2}>
                    <Text size="sm" c="dimmed" inline>
                        Accepted file type: .R
                    </Text>
                    <Text size="sm" c="dimmed" inline>
                        Maximum file size: 10MB, up to 10 files
                    </Text>
                </Stack>
            </div>
        </>
    )
}
