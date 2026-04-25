'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useIDEFiles } from '@/hooks/use-ide-files'
import { Button, Group, Stack, Text } from '@mantine/core'
import { Routes } from '@/lib/routes'
import { ResubmitCancelButton } from '@/components/resubmit-cancel-button'
import { StudyCodePanel } from '@/components/study/study-code-panel'

interface ResubmitCodeViewProps {
    studyId: string
    studyTitle: string
    submittingOrgSlug: string
}

export function ResubmitCodeView({ studyId, studyTitle, submittingOrgSlug }: ResubmitCodeViewProps) {
    const router = useRouter()

    const onSubmitSuccess = useCallback(() => {
        router.push(Routes.studyView({ orgSlug: submittingOrgSlug, studyId }))
    }, [router, submittingOrgSlug, studyId])

    const ide = useIDEFiles({ studyId, onSubmitSuccess })

    const footer = (
        <Group justify="flex-end" mt="md">
            <ResubmitCancelButton
                isDirty={ide.files.length > 0}
                disabled={ide.isDirectSubmitting}
                href={Routes.studyView({ orgSlug: submittingOrgSlug, studyId })}
            />
            <Stack align="flex-end" gap="xs">
                {ide.submitDisabledReason && (
                    <Text size="sm" c="dimmed">
                        {ide.submitDisabledReason}
                    </Text>
                )}
                <Button onClick={ide.submitDirectly} disabled={!ide.canSubmit} loading={ide.isDirectSubmitting}>
                    Submit code
                </Button>
            </Stack>
        </Group>
    )

    return <StudyCodePanel ide={ide} studyTitle={studyTitle} footer={footer} />
}
