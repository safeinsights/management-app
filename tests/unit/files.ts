import fs from 'fs'
import os from 'os'
import path from 'path'

export const readTestSupportFile = (file: string) => {
    return fs.promises.readFile(path.join(__dirname, '..', 'support', file), 'utf8')
}

// The bytes are arbitrary: the ingest routes and `storeJobFile` never read them.
export const testUploadFile = (name: string, type = 'application/zip') =>
    new File([new TextEncoder().encode('boom')], name, { type })

export const createWorkspaceDir = async (prefix: string) => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), `${prefix}-`))
    process.env.CODER_FILES = root
    return root
}

export const writeWorkspaceFiles = async (
    root: string,
    studyId: string,
    files: Record<string, string | Uint8Array>,
) => {
    const workspaceDir = path.join(root, studyId)
    await fs.promises.mkdir(workspaceDir, { recursive: true })
    await Promise.all(
        Object.entries(files).map(([fileName, content]) =>
            fs.promises.writeFile(path.join(workspaceDir, fileName), content),
        ),
    )
}

export const cleanupWorkspaceDirs = async (dirs: string[]) => {
    delete process.env.CODER_FILES
    await Promise.all(dirs.splice(0).map((root) => fs.promises.rm(root, { recursive: true, force: true })))
}
