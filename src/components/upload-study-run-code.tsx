'use client'

import { Group, Text, rem } from '@mantine/core';
import { IconUpload, IconPhoto, IconX } from '@tabler/icons-react';
import { Dropzone, DropzoneProps, type FileWithPath } from '@mantine/dropzone';
import type { MinimalRunInfo } from '@/lib/types'
import { CodeReviewManifest } from '@/lib/code-manifest'

type PreSignedPost = {
    url: string
    fields: Record<string, string>
}
//import { getUploadUrlForStudyRunCodeAction } from '../app/'
type SignedUrlFunc = (run: MinimalRunInfo) => Promise<PreSignedPost>

type UploadStudyRunCodeProps = Partial<DropzoneProps> & {
    run: MinimalRunInfo
    getSignedURL: SignedUrlFunc
}

async function uploadFile(file: FileWithPath, upload: PreSignedPost) {
    const body = new FormData()
    body.append('file', file)
    for (const [key, value] of Object.entries(upload.fields)) {
        body.append(key, value)
    }

    const response = await fetch(upload.url, {
        method: 'POST',
        body,
    });
    if (!response.ok) {
        throw new Error('Failed to upload file to S3');
    }
}

async function uploadFilesToS3(files: FileWithPath[], run: MinimalRunInfo, getSignedUrl: SignedUrlFunc) {
    const manifest = new CodeReviewManifest()

    const post = await getSignedUrl(run)

    console.log('url', post)

    for (const file of files) {
        manifest.files.push(file)
        await uploadFile(file, post);
    }
    //    console.log(manifest.asJSON)

    const file = new File([manifest.asJSON], 'manifest.json', { type: 'application/json' });
    await uploadFile(file, post)
    //await uploadFile(files[0], getSignedUrl);
}

export function UploadStudyRunCode({ run, getSignedURL, ...dzProps }: UploadStudyRunCodeProps) {

  return (
    <Dropzone
            onDrop={(files) => uploadFilesToS3(files, run, getSignedURL)}
            onReject={(files) => console.log('rejected files', files)}
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
                        Drag a R file here or click to select one.
                    </Text>
                    <Text size="sm" c="dimmed" inline mt={7}>
                        Only a single file is currently supported, we may allow multiple files in the future.
                    </Text>
                </div>
            </Group>
        </Dropzone>
    );
}
