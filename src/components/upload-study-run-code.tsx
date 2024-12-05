'use client'

import { Group, Text, rem } from '@mantine/core'
import { IconUpload, IconPhoto, IconX } from '@tabler/icons-react'
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
        throw new Error('Failed to upload file to S3')
    }
}

async function uploadFilesToS3(files: FileWithPath[], run: MinimalRunInfo, getSignedUrl: SignedUrlFunc) {
    const manifest = new CodeReviewManifest(run.studyRunId, 'r')

    const post = await getSignedUrl(run)

    for (const file of files) {
        manifest.files.push(file)
        await uploadFile(file, post)
    }
    // the manifiest MUST BE UPLOADED LAST. it's presence signals the end of the upload and triggers the docker container build
    const file = new File([manifest.asJSON], 'manifest.json', { type: 'application/json' })
    await uploadFile(file, post)
}

export function UploadStudyRunCode({ run, getSignedURL, ...dzProps }: UploadStudyRunCodeProps) {
    return (
        <Dropzone
            onDrop={(files) => uploadFilesToS3(files, run, getSignedURL)}
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
