import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { actionResult, db, insertTestCodeEnv, insertTestStudyOnly, mockSessionWithTestData } from '@/tests/unit.helpers'
import { storeS3File } from '@/server/aws'
import { pathForStarterCode } from '@/lib/paths'
import { s3Available } from '@/tests/s3.helpers'
import { ensureStarterCodePreloadAction } from './workspaces.actions'

/**
 * OTTER-693: the Data Partner's template has to reach the workspace before anyone launches an IDE,
 * so the Submit code page opens on a starred Main.{x} row rather than the empty state.
 *
 * Its own file rather than workspaces.actions.test.ts: that suite mocks @/server/config and
 * @/server/coder per test, and the pre-load needs the real ones to exercise the copy.
 */
describe('ensureStarterCodePreloadAction', () => {
    const originalCoderFiles = process.env.CODER_FILES
    let coderFiles: string

    beforeEach(async () => {
        // A fresh directory per test so a leftover file cannot trip the "do not clobber" guard.
        coderFiles = await fs.mkdtemp(path.join(os.tmpdir(), 'starter-preload-'))
        process.env.CODER_FILES = coderFiles
    })

    afterEach(async () => {
        await fs.rm(coderFiles, { recursive: true, force: true })
        if (originalCoderFiles) process.env.CODER_FILES = originalCoderFiles
        else delete process.env.CODER_FILES
    })

    const asStream = (content: string): ReadableStream =>
        new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(content))
                controller.close()
            },
        })

    const preloadFor = async (language: 'R' | 'PYTHON', starterNames: string[]) => {
        const { org, user } = await mockSessionWithTestData()
        const codeEnv = await insertTestCodeEnv({ orgId: org.id, language, starterCodeFileNames: starterNames })
        for (const fileName of starterNames) {
            await storeS3File(
                { orgSlug: org.slug },
                asStream(`# ${fileName}`),
                pathForStarterCode({ orgSlug: org.slug, codeEnvId: codeEnv.id, fileName }),
            )
        }

        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })
        // The code env is joined on study.language, which insertTestStudyOnly does not take.
        await db.updateTable('study').set({ language }).where('id', '=', study.id).execute()

        return { study, result: await ensureStarterCodePreloadAction({ studyId: study.id }) }
    }

    // CODER_DISABLED shares one workspace path across studies; otherwise each study gets its own
    // directory. Derived rather than hard-coded, because CI and a local run differ on it.
    const workspaceDir = async (studyId: string) => {
        const { CODER_DISABLED } = await import('@/server/config')
        return CODER_DISABLED ? coderFiles : path.join(coderFiles, studyId)
    }

    const templatePath = async (studyId: string, fileName: string) => path.join(await workspaceDir(studyId), fileName)

    const mainCodeFileName = async (studyId: string) =>
        (await db.selectFrom('study').select('mainCodeFileName').where('id', '=', studyId).executeTakeFirstOrThrow())
            .mainCodeFileName

    // The card names it after the language, not after whatever the Data Partner uploaded.
    it.skipIf(!s3Available)('copies the first starter file in as Main.{x} and stars it', async () => {
        const { study } = await preloadFor('R', ['main.r'])

        await expect(fs.readFile(await templatePath(study.id, 'Main.R'), 'utf8')).resolves.toContain('main.r')
        expect(await mainCodeFileName(study.id)).toBe('Main.R')
    })

    it.skipIf(!s3Available)('takes the extension from the code env language', async () => {
        const { study } = await preloadFor('PYTHON', ['main.py'])

        await expect(fs.readFile(await templatePath(study.id, 'Main.py'), 'utf8')).resolves.toBeTruthy()
        expect(await mainCodeFileName(study.id)).toBe('Main.py')
    })

    it.skipIf(!s3Available)('leaves any further starter files under their own names', async () => {
        const { study } = await preloadFor('R', ['main.r', 'helper.r'])
        const dir = await workspaceDir(study.id)

        await expect(fs.readFile(path.join(dir, 'Main.R'), 'utf8')).resolves.toBeTruthy()
        await expect(fs.readFile(path.join(dir, 'helper.r'), 'utf8')).resolves.toBeTruthy()
    })

    // Repeat page loads must not clobber what is already in the workspace.
    it.skipIf(!s3Available)('does not copy over a workspace that already has files', async () => {
        const { study } = await preloadFor('R', ['main.r'])
        const template = await templatePath(study.id, 'Main.R')
        await fs.writeFile(template, 'researcher edits')

        expect(actionResult(await ensureStarterCodePreloadAction({ studyId: study.id }))).toEqual({ preloaded: false })

        await expect(fs.readFile(template, 'utf8')).resolves.toBe('researcher edits')
    })

    // The star is the researcher's once they have moved it; a later page load must leave it alone.
    it.skipIf(!s3Available)('does not reset a main file the researcher has chosen', async () => {
        const { study } = await preloadFor('R', ['main.r'])
        await db.updateTable('study').set({ mainCodeFileName: 'mine.R' }).where('id', '=', study.id).execute()

        actionResult(await ensureStarterCodePreloadAction({ studyId: study.id }))

        expect(await mainCodeFileName(study.id)).toBe('mine.R')
    })

    it('does nothing for a study whose org has no code environment', async () => {
        const { org, user } = await mockSessionWithTestData()
        const { study } = await insertTestStudyOnly({ org, researcherId: user.id })

        expect(actionResult(await ensureStarterCodePreloadAction({ studyId: study.id }))).toEqual({ preloaded: false })
        expect(await mainCodeFileName(study.id)).toBeNull()
    })
})
