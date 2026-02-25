'use client'

import { AppModal } from '@/components/modal'
import { useDecryptFiles } from '@/hooks/use-decrypt-files'
import { fetchEncryptedScanLogsAction } from '@/server/actions/study-job.actions'
import type { LatestJobForStudy } from '@/server/db/queries'
import { Button, Code, Group, Paper, ScrollArea, Stack, Textarea, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import * as Sentry from '@sentry/nextjs'
import { useQuery } from '@/common'
import { useParams } from 'next/navigation'
import { FC, useState } from 'react'

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

    const latestStatus = job.statusChanges.at(-1)?.status
    const hasCodeScanned = latestStatus === 'CODE-SCANNED'
    const hasScanLogFiles = job.files?.some((f) => f.fileType === 'ENCRYPTED-SECURITY-SCAN-LOG') ?? false

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

    const {
        decrypt: decryptScanLog,
        isPending: isDecrypting,
        form,
    } = useDecryptFiles({
        encryptedFiles: encryptedScanLogs,
        onSuccess: (files) => {
            const decoder = new TextDecoder('utf-8')
            const text = files.map((f) => decoder.decode(f.contents)).join('\n')
            setDecryptedContent(text)
            setModalOpen(true)
        },
    })

    if (!hasCodeScanned || !hasScanLogFiles) return null

    const onSubmit = form.onSubmit(
        (values) => decryptScanLog(values.privateKey),
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
                    View Security Scan
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
