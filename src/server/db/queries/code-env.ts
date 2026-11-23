import { type DBExecutor } from '@/database'
import type { CodeEnvSnapshot } from '@/database/types-manual'

// The one rule for which code env a study runs: the org's newest non-testing env for its language.
export function latestCodeEnvForStudyQuery(db: DBExecutor, studyId: string) {
    return db
        .selectFrom('study')
        .innerJoin('orgCodeEnv', (join) =>
            join.onRef('orgCodeEnv.orgId', '=', 'study.orgId').onRef('orgCodeEnv.language', '=', 'study.language'),
        )
        .where('study.id', '=', studyId)
        .where('orgCodeEnv.isTesting', '=', false)
        .orderBy('orgCodeEnv.createdAt', 'desc')
        .limit(1)
}

// Everything a study takes from its code env, in the shape kept on study.codeEnvSnapshot.
export function selectCodeEnvSnapshot(db: DBExecutor, studyId: string) {
    return latestCodeEnvForStudyQuery(db, studyId).select([
        'orgCodeEnv.id',
        'orgCodeEnv.language',
        'orgCodeEnv.dataSourceType',
        'orgCodeEnv.url',
        'orgCodeEnv.settings',
        'orgCodeEnv.commandLines',
    ])
}

// The parts of a code env that name things an edit replaces: the sample database (named from the
// identifier) and the starter code and sample data in S3. They are never frozen.
const currentCodeEnvResources = (db: DBExecutor, codeEnvId: string) =>
    db
        .selectFrom('orgCodeEnv')
        .select(['identifier', 'starterCodeFileNames', 'sampleDataPath'])
        .where('id', '=', codeEnvId)
        .executeTakeFirst()

class CodeEnvNotFoundError extends Error {}

// The code env a study runs: the copy frozen when its language was chosen, with the resources it names
// read as they are now. A study made before studies kept a copy, or whose frozen code env has since
// been deleted (taking its database and files with it), gets the org's current code env instead.
export async function fetchCodeEnvForStudyId(studyId: string, db: DBExecutor) {
    const study = await db
        .selectFrom('study')
        .innerJoin('org', 'org.id', 'study.orgId')
        .select(['study.codeEnvSnapshot', 'study.orgId', 'org.slug'])
        .where('study.id', '=', studyId)
        .executeTakeFirstOrThrow(() => new CodeEnvNotFoundError(`no study found for studyId: ${studyId}`))

    let codeEnv: CodeEnvSnapshot | undefined = study.codeEnvSnapshot ?? undefined
    let resources = codeEnv && (await currentCodeEnvResources(db, codeEnv.id))
    if (!codeEnv || !resources) {
        codeEnv = await selectCodeEnvSnapshot(db, studyId).executeTakeFirst()
        resources = codeEnv && (await currentCodeEnvResources(db, codeEnv.id))
    }
    if (!codeEnv || !resources) throw new CodeEnvNotFoundError(`no code environment found for studyId: ${studyId}`)
    return { ...codeEnv, ...resources, slug: study.slug, orgId: study.orgId }
}

export async function fetchCodeEnvForStudyIdOrNull(studyId: string, executor: DBExecutor) {
    try {
        return await fetchCodeEnvForStudyId(studyId, executor)
    } catch (err) {
        if (err instanceof CodeEnvNotFoundError) return null
        throw err
    }
}
