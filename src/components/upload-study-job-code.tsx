'use client'
import { useCallback, useState } from 'react'
import { ActionIcon, Button, Divider, FileButton, Flex, Group, Paper, rem, Stack, Text } from '@mantine/core'
import { Check, Trash, Upload, UploadSimple, X as PhosphorX } from '@phosphor-icons/react/dist/ssr'
import { Dropzone, DropzoneProps, type FileWithPath } from '@mantine/dropzone'
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
    onUploadComplete?: (files: FileWithPath[]) => void
}

type FileUploadProgress = {
    file: FileWithPath
    progress: number
    status: 'pending' | 'uploading' | 'complete' | 'error'
}

async function uploadFile(file: FileWithPath, upload: PreSignedPost, onProgress?: (progress: number) => void) {
    const body = new FormData()
    for (const [key, value] of Object.entries(upload.fields)) {
        body.append(key, value)
    }
    body.append('file', file)

    return new Promise<boolean>((resolve) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', upload.url, true)

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && onProgress) {
                const percentComplete = (event.loaded / event.total) * 100
                onProgress(percentComplete)
            }
        }

        xhr.onload = () => {
            if (xhr.status === 200) {
                resolve(true)
            } else {
                notifications.show({
                    color: 'red',
                    title: 'Failed to upload file',
                    message: `${file.name}: ${xhr.responseText}`,
                })
                resolve(false)
            }
        }

        xhr.onerror = () => {
            notifications.show({
                color: 'red',
                title: 'Upload failed',
                message: `${file.name}: Network error occurred`,
            })
            resolve(false)
        }

        xhr.send(body)
    })
}

async function uploadFilesToS3(
    files: FileWithPath[],
    job: MinimalJobInfo,
    getSignedUrl: SignedUrlFunc,
    onProgress?: (fileProgresses: FileUploadProgress[]) => void,
) {
    const manifest = new CodeReviewManifest(job.studyJobId, 'r')

    const post = await getSignedUrl(job)
    const fileProgresses: FileUploadProgress[] = files.map((file) => ({
        file,
        progress: 0,
        status: 'pending',
    }))

    const uploadPromises = fileProgresses.map(async (fileProgress, index) => {
        const file = fileProgress.file
        manifest.files.push(file)

        fileProgress.status = 'uploading'
        const success = await uploadFile(file, post, (progress) => {
            fileProgresses[index].progress = progress
            if (onProgress) onProgress([...fileProgresses])
        })

        fileProgress.status = success ? 'complete' : 'error'
        if (onProgress) onProgress([...fileProgresses])
        return success
    })

    // Upload manifest last
    const manifestFile = new File([manifest.asJSON], 'manifest.json', { type: 'application/json' })
    const manifestSuccess = await uploadFile(manifestFile, post)

    const allSuccess = (await Promise.all(uploadPromises)).every(Boolean) && manifestSuccess
    return { allSuccess, fileProgresses }
}

export function UploadStudyJobCode({ job, getSignedURL, onUploadComplete, ...dzProps }: UploadStudyJobCodeProps) {
    const [uploadState, setUploading] = useState<'idle' | 'uploading' | 'complete'>('idle')
    const [fileProgresses, setFileProgresses] = useState<FileUploadProgress[]>([])

    const onDrop = useCallback(
        async (files: FileWithPath[]) => {
            // Remove any files that are already in the list
            const newFiles = files.filter((newFile) => !fileProgresses.some((fp) => fp.file.name === newFile.name))

            if (newFiles.length === 0) {
                notifications.show({
                    color: 'yellow',
                    title: 'Duplicate Files',
                    message: 'These files have already been uploaded',
                })
                return
            }

            setUploading('uploading')
            const { allSuccess, fileProgresses } = await uploadFilesToS3(
                newFiles,
                job,
                getSignedURL,
                (updatedProgresses) => {
                    // Merge with existing progresses
                    setFileProgresses((current) => [
                        ...current.filter((fp) => !updatedProgresses.some((p) => p.file.name === fp.file.name)),
                        ...updatedProgresses,
                    ])
                },
            )

            if (allSuccess) {
                setUploading('complete')

                // Optional callback for parent component
                if (onUploadComplete) {
                    onUploadComplete(newFiles)
                }
            }
        },
        [setUploading, getSignedURL, job, fileProgresses, onUploadComplete],
    )

    const removeFile = useCallback((fileToRemove: FileWithPath) => {
        setFileProgresses((current) => current.filter((fp) => fp.file.name !== fileToRemove.name))
    }, [])

    return (
        <>
            <Paper p="xl">
                <Text>Study Code</Text>
                <Divider my="sm" mt="sm" mb="md" />
                <Text mb="md">
                    This section is key to your proposal, as it defines the analysis that will generate the results
                    you&nbsp;re intending to obtain from the Member&nbsp;s data. Upload any necessary files to support
                    your analysis. In this iteration, we currently support .r and .rmd files.
                </Text>

                <Group>
                    <Stack w="30%">
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
                            multiple={true}
                            maxFiles={10}
                        >
                            <Stack align="center" justify="center" gap="md" mih={120} style={{ pointerEvents: 'none' }}>
                                <Dropzone.Accept>
                                    <Upload
                                        style={{
                                            width: rem(52),
                                            height: rem(52),
                                            color: 'var(--mantine-color-blue-6)',
                                        }}
                                    />
                                </Dropzone.Accept>
                                <Dropzone.Reject>
                                    <PhosphorX
                                        style={{ width: rem(52), height: rem(52), color: 'var(--mantine-color-red-6)' }}
                                    />
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
                                <FileButton onChange={onDrop} accept=".r,.rmd" multiple={true}>
                                    {(props) => (
                                        <Button {...props} variant="outline" color="#616161">
                                            Upload
                                        </Button>
                                    )}
                                </FileButton>
                            </Group>
                        </Dropzone>

                        <div>
                            <Stack gap="xs" pl={2} mt="md">
                                <Text size="sm" c="dimmed" inline>
                                    Accepted file types: .R, .Rmd
                                </Text>
                                <Text size="sm" c="dimmed" inline>
                                    Maximum file size: 10MB, up to 10 files
                                </Text>
                            </Stack>
                        </div>
                    </Stack>

                    {(uploadState === 'uploading' || uploadState === 'complete') && fileProgresses.length > 0 && (
                        <Stack gap="xs" mt="sm">
                            <Text size="sm" fw={500}>
                                Uploaded Files:
                            </Text>
                            {fileProgresses.map((fileProgress) => (
                                <Flex
                                    key={fileProgress.file.name}
                                    align="center"
                                    justify="space-between"
                                    p="xs"
                                    bg={
                                        fileProgress.status === 'error'
                                            ? 'var(--mantine-color-red-light)'
                                            : fileProgress.status === 'complete'
                                              ? 'var(--mantine-color-green-light)'
                                              : 'var(--mantine-color-gray-light)'
                                    }
                                    style={{ borderRadius: 'var(--mantine-radius-md)' }}
                                >
                                    <Flex align="center" gap="md">
                                        {fileProgress.status === 'complete' ? (
                                            <Check color="var(--mantine-color-green-6)" />
                                        ) : fileProgress.status === 'error' ? (
                                            <PhosphorX color="var(--mantine-color-red-6)" />
                                        ) : null}
                                        <Text size="sm" p="xs">
                                            {fileProgress.file.name}
                                        </Text>
                                    </Flex>
                                    <Flex align="center" gap="sm">
                                        <Text
                                            size="sm"
                                            c={
                                                fileProgress.status === 'error'
                                                    ? 'red'
                                                    : fileProgress.status === 'complete'
                                                      ? 'green'
                                                      : 'gray'
                                            }
                                        >
                                            {fileProgress.status === 'complete'
                                                ? 'Uploaded'
                                                : fileProgress.status === 'error'
                                                  ? 'Failed'
                                                  : `${Math.round(fileProgress.progress)}%`}
                                        </Text>
                                        {(fileProgress.status === 'complete' || fileProgress.status === 'error') && (
                                            <ActionIcon
                                                variant="subtle"
                                                color="red"
                                                onClick={() => removeFile(fileProgress.file)}
                                            >
                                                <Trash size={16} />
                                            </ActionIcon>
                                        )}
                                    </Flex>
                                </Flex>
                            ))}
                        </Stack>
                    )}
                </Group>
            </Paper>
        </>
    )
}
