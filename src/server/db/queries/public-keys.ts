import { throwNotFound } from '@/lib/errors'
import { currentDb } from '@/server/request-context'
import type { PublicKey } from 'si-encryption/job-results/types'

export async function getOrgPublicKeysRaw(orgId: string) {
    return await currentDb()
        .selectFrom('orgUser')
        .innerJoin('userPublicKey', 'userPublicKey.userId', 'orgUser.userId')
        .select(['userPublicKey.publicKey', 'userPublicKey.fingerprint'])
        .where('orgUser.orgId', '=', orgId)
        .execute()
}

export async function getOrgPublicKeys(orgId: string): Promise<PublicKey[]> {
    const keys = await getOrgPublicKeysRaw(orgId)
    return keys.map(({ publicKey, fingerprint }) => {
        const arrayBuffer = new ArrayBuffer(publicKey.byteLength)
        new Uint8Array(arrayBuffer).set(publicKey)
        return { publicKey: arrayBuffer, fingerprint }
    })
}

const labOrgIdForJob = async (jobId: string) =>
    await currentDb()
        .selectFrom('studyJob')
        .innerJoin('study', 'study.id', 'studyJob.studyId')
        .select('study.submittedByOrgId')
        .where('studyJob.id', '=', jobId)
        .executeTakeFirstOrThrow(throwNotFound(`job ${jobId}`))

export async function getLabPublicKeysForJob(jobId: string): Promise<PublicKey[]> {
    const { submittedByOrgId } = await labOrgIdForJob(jobId)
    return getOrgPublicKeys(submittedByOrgId)
}

export async function getLabPublicKeysForStudy(studyId: string): Promise<PublicKey[]> {
    const { submittedByOrgId } = await currentDb()
        .selectFrom('study')
        .select('submittedByOrgId')
        .where('id', '=', studyId)
        .executeTakeFirstOrThrow(throwNotFound(`study ${studyId}`))
    return getOrgPublicKeys(submittedByOrgId)
}
