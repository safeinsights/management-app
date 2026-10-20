import { type DBExecutor } from '@/database'
import { fetchCodeEnvForStudyId, getStudyJobFileOfType, type LatestJobForStudy } from '@/server/db/queries'
import { triggerBuildImageForJob } from '@/server/aws'
import { SIMULATE_CODE_BUILD } from '@/server/config'
import { bareExtension } from '@/lib/paths'

export async function approveJobCode({
    db,
    job,
    study,
    userId,
    studyId,
    orgSlug,
}: {
    db: DBExecutor
    job: LatestJobForStudy
    study: { orgId: string; containerLocation: string }
    userId: string
    studyId: string
    orgSlug: string
}) {
    await db
        .insertInto('jobStatusChange')
        .values({ userId, status: 'CODE-APPROVED', studyJobId: job.id })
        .executeTakeFirstOrThrow()

    if (SIMULATE_CODE_BUILD) {
        await db
            .insertInto('jobStatusChange')
            .values({ userId, status: 'JOB-READY', studyJobId: job.id })
            .executeTakeFirstOrThrow()
    } else {
        // The study runs the code env frozen when its language was chosen.
        const image = await fetchCodeEnvForStudyId(studyId, db)

        const mainCode = await getStudyJobFileOfType(job.id, 'MAIN-CODE')
        const ext = bareExtension(mainCode.name)
        const cmdLine = image.commandLines[ext]
        if (!cmdLine) {
            throw new Error(`No command line configured for extension ".${ext}" in code environment`)
        }

        await triggerBuildImageForJob({
            studyJobId: job.id,
            studyId,
            orgSlug,
            containerLocation: study.containerLocation,
            codeEntryPointFileName: mainCode.name,
            cmdLine,
            codeEnvURL: image.url,
        })
    }
}
