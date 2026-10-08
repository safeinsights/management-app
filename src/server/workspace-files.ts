import * as path from 'node:path'
import { getConfigValue } from '@/server/config'

export async function getStudyFilesPath(studyId: string): Promise<string> {
    return path.join(await getConfigValue('CODER_FILES'), studyId)
}
