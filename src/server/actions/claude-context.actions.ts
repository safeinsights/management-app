'use server'

import { pathForContext } from '@/lib/paths'
import { storeS3File } from '../aws'
import { Action } from './action'
import { z } from 'zod'

export const uploadClaudeContextAction = new Action('uploadClaudeContextAction', {})
    .params(z.object({ file: z.instanceof(File) }))
    .handler(async ({ params: { file } }) => {
        return await storeS3File({ orgSlug: 'safeinsights' }, file.stream(), pathForContext({ fileName: 'system.md' }))
    })
