'use client'

import { useQuery } from '@/common'
import { StudyCodeFromIDE } from '@/components/study/study-code-from-ide'
import { StudyCodeFromUpload } from '@/components/study/study-code-from-upload'
import { AlertNotFound } from '@/components/errors'
import { uploadFileStore } from '@/hooks/upload-file-store'
import { Stack, Title } from '@mantine/core'
import { useParams } from 'next/navigation'
import { getDraftStudyAction } from '../../request/actions'

export default function StudySelectFilesPage() {
    const { orgSlug, studyId } = useParams<{ orgSlug: string; studyId: string }>()

    const hasUploadedFiles = !!uploadFileStore.get(studyId)

    const { data: study, isLoading } = useQuery({
        queryKey: ['draft-study', studyId],
        queryFn: () => getDraftStudyAction({ studyId }),
        enabled: !!studyId,
    })

    if (isLoading) {
        return (
            <Stack p="xl">
                <Title order={1}>Loading...</Title>
            </Stack>
        )
    }

    if (!study || 'error' in study) {
        return <AlertNotFound title="Study not found" message="This study does not exist or is not a draft." />
    }

    return (
        <Stack p="xl" gap="xl">
            {hasUploadedFiles ? (
                <StudyCodeFromUpload studyId={studyId} orgSlug={orgSlug} />
            ) : (
                <StudyCodeFromIDE studyId={studyId} orgSlug={orgSlug} />
            )}
        </Stack>
    )
}
