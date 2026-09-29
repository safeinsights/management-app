// Kept out of unit.helpers.tsx: vitest.setup.ts imports that, and pulling the server module
// graph in during setup would break test-file-level vi.mock() calls.
import { actionResult } from '@/lib/utils'
import { getStudyAction, type SelectedStudy } from '@/server/actions/study.actions'
import { insertTestStudyJobData, insertTestStudyOnly, mockSessionWithTestData } from '@/tests/unit.helpers'

export type { SelectedStudy }

export async function setupStudyAction({
    orgSlug,
    orgType,
    createJob = true,
}: {
    orgSlug?: string
    orgType?: 'enclave' | 'lab'
    createJob?: boolean
} = {}) {
    const { org, user } = await mockSessionWithTestData({ orgSlug, orgType })
    if (createJob) {
        const { study: dbStudy, latestJobWithStatus } = await insertTestStudyJobData({ org, researcherId: user.id })
        const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
        return { org, user, study, latestJob: latestJobWithStatus }
    }
    const { study: dbStudy } = await insertTestStudyOnly({ org, researcherId: user.id })
    const study = actionResult(await getStudyAction({ studyId: dbStudy.id }))
    return { org, user, study, latestJob: null }
}
