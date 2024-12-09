'use client'
import { useCallback, useState } from 'react'
import { Group, Text, Paper, Flex, rem } from '@mantine/core'
import { IconUpload, IconPhoto, IconX, IconSourceCode } from '@tabler/icons-react'
import { Dropzone, DropzoneProps, type FileWithPath } from '@mantine/dropzone'
import type { MinimalRunInfo } from '@/lib/types'
import { CodeReviewManifest } from '@/lib/code-manifest'
import { notifications } from '@mantine/notifications'

type PreSignedPost = {
    url: string
    fields: Record<string, string>
}

type SignedUrlFunc = (_run: MinimalRunInfo) => Promise<PreSignedPost>

type UploadStudyRunCodeProps = Partial<DropzoneProps> & {
    run: MinimalRunInfo
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

async function uploadFilesToS3(files: FileWithPath[], run: MinimalRunInfo, getSignedUrl: SignedUrlFunc) {
    const manifest = new CodeReviewManifest(run.studyRunId, 'r')

    const post = await getSignedUrl(run)
    let allSuccess = true
    for (const file of files) {
        manifest.files.push(file)
        if (!(await uploadFile(file, post))) allSuccess = false
    }
    // the manifiest MUST BE UPLOADED LAST. it's presence signals the end of the upload and triggers the docker container build
    const file = new File([manifest.asJSON], 'manifest.json', { type: 'application/json' })
    if (!(await uploadFile(file, post))) allSuccess = false
    return allSuccess
}

export function UploadStudyRunCode({ run, getSignedURL, ...dzProps }: UploadStudyRunCodeProps) {
    const [uploadState, setUploading] = useState<false | 'uploading' | 'complete'>(false)

    const onDrop = useCallback(
        async (files: FileWithPath[]) => {
            setUploading('uploading')
            const success = await uploadFilesToS3(files, run, getSignedURL)
            if (success) setUploading('complete')
        },
        [setUploading],
    )

    if (uploadState == 'complete') {
        return (
            <Paper shadow="none" mt={30} radius="sm" withBorder p="xl">
                <Flex gap="lg">
                    <IconSourceCode size={70} />
                    <Flex direction={'column'} justify="space-around">
                        <h4>Uploaded files</h4>
                        <p>All files were uploaded successfully</p>
                    </Flex>
                </Flex>
            </Paper>
        )
    }

    return (
        <Dropzone
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
            <Group justify="center" gap="xl" mih={220} style={{ pointerEvents: 'none' }}>
                <Dropzone.Accept>
                    <IconUpload
                        style={{ width: rem(52), height: rem(52), color: 'var(--mantine-color-blue-6)' }}
                        stroke={1.5}
                    />
                </Dropzone.Accept>
                <Dropzone.Reject>
                    <IconX
                        style={{ width: rem(52), height: rem(52), color: 'var(--mantine-color-red-6)' }}
                        stroke={1.5}
                    />
                </Dropzone.Reject>
                <Dropzone.Idle>
                    <IconPhoto
                        style={{ width: rem(52), height: rem(52), color: 'var(--mantine-color-dimmed)' }}
                        stroke={1.5}
                    />
                </Dropzone.Idle>

                <div>
                    <Text size="xl" inline>
                        Drag files here or click to select a file or directory.
                    </Text>
                    <Text size="sm" c="dimmed" inline mt={7}>
                        If more than one file is uploaded, one of them <b>MUST</b> be named <b>main.r</b>
                    </Text>
                </div>
            </Group>
        </Dropzone>
    )
}
