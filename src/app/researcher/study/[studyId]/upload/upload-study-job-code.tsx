'use client'
import { useCallback, useState } from 'react'
import { ActionIcon, Button, Divider, FileInput, Flex, Group, Paper, rem, Stack, Text, Anchor } from '@mantine/core'
import { CheckCircle, Trash, Upload, UploadSimple, X as PhosphorX } from '@phosphor-icons/react/dist/ssr'
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
            const { allSuccess } = await uploadFilesToS3(newFiles, job, getSignedURL, (updatedProgresses) => {
                // Merge with existing progresses
                setFileProgresses((current) => [
                    ...current.filter((fp) => !updatedProgresses.some((p) => p.file.name === fp.file.name)),
                    ...updatedProgresses,
                ])
            })

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
                <Text fw="bold">Study Code</Text>
                <Divider my="sm" mt="sm" mb="md" />
                <Text mb="md">
                    This section is key to your proposal, as it defines the analysis that will generate the results
                    you&apos;re intending to obtain from the Member&apos;s data. Upload any necessary files to support
                    your analysis. In this iteration, we currently support .r and .rmd files.
                </Text>

                <Group align="space-between" gap="xl">
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
                            accept={['.r', '.rmd', '.R']}
                        >
                            <Stack align="center" justify="center" gap="md" mih={120} style={{ pointerEvents: 'none' }}>
                                <Text fw="bold">Upload File</Text>
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
                                <Group gap="xs">
                                    <Text size="md">Drop your files or</Text>
                                    <FileInput
                                        component={Anchor}
                                        placeholder="Browse"
                                        onChange={onDrop}
                                        accept=".r,.rmd"
                                        multiple={true}
                                    />
                                </Group>
                                <Group>
                                    <Text size="xs" c="dimmed">
                                        .R, .r, .rmd only
                                    </Text>
                                    <Divider orientation="vertical" size="xs" />
                                    <Text size="xs" c="dimmed">
                                        10MB max
                                    </Text>
                                </Group>
                            </Stack>
                        </Dropzone>
                    </Stack>
                    {(uploadState === 'uploading' || uploadState === 'complete') && fileProgresses.length > 0 && (
                        <>
                            <Divider orientation="vertical" />
                            <Stack gap="xs" mt="sm">
                                <Text size="sm" c="#828181">
                                    {fileProgresses.filter((fp) => fp.status === 'complete').length} of{' '}
                                    {fileProgresses.length} files uploaded
                                </Text>
                                {fileProgresses.map((fileProgress) => (
                                    <Flex key={fileProgress.file.name} p="xs">
                                        <Group>
                                            {fileProgress.status === 'complete' ? (
                                                <CheckCircle color="var(--mantine-color-green-6)" weight="fill" />
                                            ) : null}
                                            <Text size="sm">{fileProgress.file.name}</Text>
                                        </Group>
                                        <Group>
                                            {(fileProgress.status === 'complete' ||
                                                fileProgress.status === 'error') && (
                                                <ActionIcon
                                                    variant="subtle"
                                                    onClick={() => removeFile(fileProgress.file)}
                                                >
                                                    <Trash size={14} color="#C4C9CF" />
                                                </ActionIcon>
                                            )}
                                        </Group>
                                    </Flex>
                                ))}
                            </Stack>
                        </>
                    )}
                </Group>
            </Paper>
        </>
    )
}
