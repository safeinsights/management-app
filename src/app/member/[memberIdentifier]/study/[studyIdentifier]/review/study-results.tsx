'use client'

import React, { FC, useState } from 'react'
import { useForm } from '@mantine/form'
import { Anchor, Button, Group, Paper, Stack, Text, Textarea, Title } from '@mantine/core'
import { StudyJob } from '@/schema/study'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ResultsReader } from 'si-encryption/job-results/reader'
import { JobReviewButtons } from '@/app/member/[memberIdentifier]/study/[studyIdentifier]/review/job-review-buttons'
import Link from 'next/link'
import { fingerprintKeyData, pemToArrayBuffer, privateKeyFromBuffer } from 'si-encryption/util'
import { StudyJobStatus } from '@/database/types'
import { fetchJobResultsEncryptedZipAction } from '@/server/actions/study-job.actions'

async function fingerPrintPublicKeyFromPrivateKey(privateKey: CryptoKey) {
    // Export the private key as a JWK (JSON Web Key)
    const jwk = await crypto.subtle.exportKey('jwk', privateKey)

    // Create a public JWK by keeping only the public parts: the modulus (n) and exponent (e)
    const publicJwk = {
        kty: jwk.kty, // key type (should be "RSA")
        n: jwk.n, // modulus
        e: jwk.e, // public exponent
        alg: jwk.alg, // algorithm (e.g., "RSA-OAEP-256")
        ext: jwk.ext, // extractable flag
    }

    // Re-import the public JWK as a public CryptoKey
    const publicKey = await crypto.subtle.importKey(
        'jwk',
        publicJwk,
        { name: 'RSA-OAEP', hash: 'SHA-256' }, // Use your specific algorithm here
        true,
        ['encrypt'], // Set usages appropriate for your public key (e.g., "encrypt")
    )

    const pk = await crypto.subtle.exportKey('spki', publicKey)
    return await fingerprintKeyData(pk)
}

interface StudyResultsFormValues {
    privateKey: string
}

export const StudyResults: FC<{
    latestJob: StudyJob | null
    fingerprint: string | undefined
    jobStatus: StudyJobStatus | null
}> = ({ latestJob, fingerprint, jobStatus }) => {
    const [decryptedResults, setDecryptedResults] = useState<string[]>()

    const form = useForm({
        mode: 'uncontrolled',
        initialValues: { privateKey: '' },
    })

    const { isLoading: isLoadingBlob, data: blob } = useQuery({
        queryKey: ['study-job', latestJob?.id],
        queryFn: async () => {
            try {
                return await fetchJobResultsEncryptedZipAction(latestJob!.id)
            } catch (error) {
                form.setFieldError('privateKey', 'Failed to fetch results, please try again later.')
                throw error
            }
        },
        enabled: Boolean(latestJob && jobStatus == 'RUN-COMPLETE'),
    })

    const { mutate: decryptResults, isPending: isDecrypting } = useMutation({
        mutationFn: async ({ privateKey }: { privateKey: string }) => {
            if (!blob) return []
            const privateKeyBuffer = pemToArrayBuffer(privateKey)
            const key = await privateKeyFromBuffer(privateKeyBuffer)
            const fingerprint = await fingerPrintPublicKeyFromPrivateKey(key)

            const reader = new ResultsReader(blob, privateKeyBuffer, fingerprint)
            return await reader.decryptZip()
        },
        onSuccess: async (data: string[]) => {
            setDecryptedResults(data)
        },
        onError: async (error) => {
            console.error(error)
            form.setFieldError('privateKey', 'Invalid private key, please double check the key and try again.')
        },
    })

    if (!latestJob) {
        return (
            <Paper bg="white" p="xl">
                <Text>Study results are not available yet</Text>
            </Paper>
        )
    }

    if (!fingerprint) {
        return (
            <Paper bg="white" p="xl">
                <Text>It looks like you have not generated a key yet.</Text>
                <Text>You cannot view results without a private key.</Text>
            </Paper>
        )
    }

    if (jobStatus === 'RESULTS-REJECTED') {
        return (
            <Paper bg="white" p="xl">
                <Title order={4}>Latest results rejected</Title>
            </Paper>
        )
    }

    const onSubmit = (values: StudyResultsFormValues) => {
        decryptResults({ privateKey: values.privateKey })
    }

    const handleError = (errors: typeof form.errors) => {
        if (errors.privateKey) {
            notifications.show({ message: 'Invalid private key', color: 'red' })
        }
    }

    return (
        <Paper bg="white">
            <Stack>
                <Group justify="space-between">
                    {decryptedResults?.length && (
                        <JobReviewButtons job={latestJob} decryptedResults={decryptedResults} />
                    )}
                </Group>
                <Stack>{decryptedResults}</Stack>
                <Stack>
                    {jobStatus === 'RUN-COMPLETE' && !decryptedResults?.length && (
                        <form onSubmit={form.onSubmit((values) => onSubmit(values), handleError)}>
                            <Group>
                                <Textarea
                                    resize="vertical"
                                    {...form.getInputProps('privateKey')}
                                    label="To unlock and review the results of this analysis, please enter the private key you’ve originally created when first onboarding into SafeInsights"
                                    placeholder="Enter private key"
                                    key={form.key('privateKey')}
                                />
                                <Button type="submit" disabled={!form.isValid || isLoadingBlob} loading={isDecrypting}>
                                    View Results
                                </Button>
                            </Group>
                        </form>
                    )}
                </Stack>
                {jobStatus === 'RESULTS-APPROVED' ? (
                    <Stack>
                        <Anchor target="_blank" component={Link} href={`/dl/results/${latestJob.id}`}>
                            View results here
                        </Anchor>
                    </Stack>
                ) : null}
            </Stack>
        </Paper>
    )
}
