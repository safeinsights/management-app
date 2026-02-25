'use client'

import { reportMutationError } from '@/components/errors'
import { AppModal } from '@/components/modal'
import { approvedTypeForFile } from '@/lib/file-type-helpers'
import type { JobFileInfo } from '@/lib/types'
import { fetchEncryptedScanLogsAction } from '@/server/actions/study-job.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import { Button, Code, Group, Paper, ScrollArea, Stack, Textarea, Title } from '@mantine/core'
import { isNotEmpty, useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import * as Sentry from '@sentry/nextjs'
import { useMutation, useQuery } from '@/common'
import { useParams } from 'next/navigation'
import { FC, useState } from 'react'
import { ResultsReader } from 'si-encryption/job-results/reader'
import { fingerprintPublicKeyFromPrivateKey, pemToArrayBuffer, privateKeyFromBuffer } from 'si-encryption/util'

type Props = {
    job: NonNullable<LatestJobForStudy>
}

const ScanLogViewButton: FC<{ onClick: () => void }> = ({ onClick }) => (
    <Button variant="light" onClick={onClick}>
        View Scan Log
    </Button>
)

export const SecurityScanPanel: FC<Props> = ({ job }) => {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const [decryptedContent, setDecryptedContent] = useState<string | null>(null)
    const [modalOpen, setModalOpen] = useState(false)

    const hasCodeScanned = job.statusChanges.some((sc) => sc.status === 'CODE-SCANNED')
    const hasScanLogFiles = job.files?.some((f) => f.fileType === 'ENCRYPTED-SECURITY-SCAN-LOG') ?? false

    const form = useForm({
        mode: 'uncontrolled',
        initialValues: { privateKey: '' },
        validate: {
            privateKey: isNotEmpty('Required'),
        },
        validateInputOnChange: true,
    })

    const { isLoading: isLoadingBlob, data: encryptedScanLogs } = useQuery({
        queryKey: ['security-scan-logs', job.id],
        queryFn: async () => {
            try {
                return await fetchEncryptedScanLogsAction({ jobId: job.id, orgSlug })
            } catch (error) {
                Sentry.captureException(error)
                form.setFieldError('privateKey', 'Failed to fetch scan logs, please try again later.')
                throw error
            }
        },
        enabled: hasCodeScanned && hasScanLogFiles,
    })

    const { mutate: decryptScanLog, isPending: isDecrypting } = useMutation({
        mutationFn: async ({ privateKey }: { privateKey: string }) => {
            if (!encryptedScanLogs) return []
            let fingerprint = ''
            let privateKeyBuffer: ArrayBuffer = new ArrayBuffer(0)
            try {
                privateKeyBuffer = pemToArrayBuffer(privateKey)
                const key = await privateKeyFromBuffer(privateKeyBuffer)
                fingerprint = await fingerprintPublicKeyFromPrivateKey(key)
            } catch (err) {
                form.setFieldError('privateKey', 'Invalid key data, check that key was copied successfully')
                throw err
            }
            try {
                const decryptedFiles: JobFileInfo[] = []
                for (const encryptedBlob of encryptedScanLogs) {
                    const reader = new ResultsReader(encryptedBlob.blob, privateKeyBuffer, fingerprint)
                    const extractedFiles = await reader.extractFiles()
                    for (const extractedFile of extractedFiles) {
                        decryptedFiles.push({
                            ...extractedFile,
                            sourceId: encryptedBlob.sourceId,
                            fileType: approvedTypeForFile(encryptedBlob.fileType),
                        })
                    }
                }
                return decryptedFiles
            } catch (err) {
                form.setFieldError(
                    'privateKey',
                    'Private key is not valid for these results, check with your administrator',
                )
                throw err
            }
        },
        onSuccess: (files: JobFileInfo[]) => {
            const decoder = new TextDecoder('utf-8')
            const text = files.map((f) => decoder.decode(f.contents)).join('\n')
            setDecryptedContent(text)
            setModalOpen(true)
        },
        onError: reportMutationError('scan log decryption failed'),
    })

    if (!hasCodeScanned || !hasScanLogFiles) return null

    const onSubmit = form.onSubmit(
        (values) => decryptScanLog({ privateKey: values.privateKey }),
        (errors) => {
            if (errors.privateKey) {
                notifications.show({ message: 'Invalid private key', color: 'red' })
            }
        },
    )

    return (
        <Paper bg="white" p="xxl">
            <Stack>
                <Title order={4} size="xl">
                    Security Scan
                </Title>
                {decryptedContent ? (
                    <ScanLogViewButton onClick={() => setModalOpen(true)} />
                ) : (
                    <form onSubmit={onSubmit}>
                        <Stack>
                            <Textarea
                                label="Enter Reviewer Key"
                                resize="vertical"
                                {...form.getInputProps('privateKey')}
                                placeholder="Enter your Reviewer key to decrypt the security scan log."
                                key={form.key('privateKey')}
                            />
                            <Group>
                                <Button
                                    type="submit"
                                    disabled={!form.isValid() || isLoadingBlob}
                                    loading={isDecrypting}
                                >
                                    Decrypt Scan Log
                                </Button>
                            </Group>
                        </Stack>
                    </form>
                )}
            </Stack>
            <AppModal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Security Scan Log" size="xl">
                <ScrollArea h={500}>
                    <Code block>{decryptedContent}</Code>
                </ScrollArea>
            </AppModal>
        </Paper>
    )
}
