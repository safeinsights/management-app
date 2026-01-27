import { ResearcherBreadcrumbs } from '@/components/page-breadcrumbs'
import { db } from '@/database'
import { Stack } from '@mantine/core'
import { DraftSubmissionReview } from './draft-submission-review'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { Routes } from '@/lib/routes'
import { redirect } from 'next/navigation'

type LabReviewViewProps = {
    orgSlug: string
    study: SelectedStudy
}

export async function LabReviewView({ orgSlug, study }: LabReviewViewProps) {
    // Lab org - only show draft review for DRAFT studies, otherwise redirect to view
    if (study.status !== 'DRAFT') {
        redirect(Routes.studyView({ orgSlug, studyId: study.id }))
    }

    // Get code files for draft
    const studyJob = await db
        .selectFrom('studyJob')
        .select('id')
        .where('studyId', '=', study.id)
        .orderBy('createdAt', 'desc')
        .executeTakeFirst()

    let codeFiles: { name: string; fileType: string }[] = []
    if (studyJob) {
        codeFiles = await db
            .selectFrom('studyJobFile')
            .select(['name', 'fileType'])
            .where('studyJobId', '=', studyJob.id)
            .execute()
    }

    return (
        <Stack p="xl" gap="xl">
            <ResearcherBreadcrumbs
                crumbs={{
                    orgSlug,
                    studyId: study.id,
                    current: 'Review submission',
                }}
            />
            <DraftSubmissionReview
                studyId={study.id}
                orgSlug={study.orgSlug}
                submittingOrgSlug={orgSlug}
                title={study.title || ''}
                piName={study.piName || ''}
                language={study.language!}
                existingDocuments={{
                    description: study.descriptionDocPath,
                    irb: study.irbDocPath,
                    agreement: study.agreementDocPath,
                }}
                existingCodeFiles={{
                    mainFileName: codeFiles.find((f) => f.fileType === 'MAIN-CODE')?.name,
                    additionalFileNames: codeFiles.filter((f) => f.fileType === 'SUPPLEMENTAL-CODE').map((f) => f.name),
                }}
            />
        </Stack>
    )
}
