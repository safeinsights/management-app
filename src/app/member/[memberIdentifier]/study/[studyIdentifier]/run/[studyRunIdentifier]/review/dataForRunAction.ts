'use server'
import { db } from '@/database'
import { CodeManifest } from '@/lib/types'
import { b64toUUID } from '@/lib/uuid'
import { fetchCodeManifest } from '@/server/aws'
import { USING_S3_STORAGE } from '@/server/config'
import { devReadCodeFile } from '@/server/dev/code-files'

export const dataForRunAction = async (studyRunIdentifier: string) => {
    const runId = b64toUUID(studyRunIdentifier)
    const runInfo = await db
        .selectFrom('studyRun')
        .innerJoin('study', 'study.id', 'studyRun.studyId')
        .innerJoin('member', 'study.memberId', 'member.id')
        .select([
            'studyRun.id as studyRunId',
            'studyRun.studyId',
            'studyRun.createdAt',
            'study.title as studyTitle',
            'member.identifier as memberIdentifier',
        ])
        .where('studyRun.id', '=', runId)
        .executeTakeFirst()

    let manifest: CodeManifest = {
        runId,
        language: 'r',
        files: {},
        size: 0,
        tree: { label: '', value: '', size: 0, children: [] },
    }

    if (runInfo) {
        try {
            if (USING_S3_STORAGE) {
                manifest = await fetchCodeManifest(runInfo)
            } else {
                const buf = await devReadCodeFile(runInfo, 'manifest.json')
                manifest = JSON.parse(buf.toString('utf-8'))
            }
        } catch (e) {
            console.error('Failed to fetch code manifest', e) // eslint-disable-line no-console
        }
    }

    return { runInfo, manifest }
}
