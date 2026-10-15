import type { DBExecutor } from '@/database'
import { sleep } from '@/lib/utils'
import { deferred } from '@/server/events'
import { currentDb } from '@/server/request-context'

const completeFakeCodeScan = deferred(async (codeEnvId: string) => {
    await sleep({ 30: 'seconds' })
    await currentDb()
        .insertInto('codeScan')
        .values({ codeEnvId, status: 'SCAN-COMPLETE', results: 'EVERYTHING IS FINE!' })
        .execute()
})

export async function insertFakeCodeScan(codeEnvId: string, executor: DBExecutor) {
    await executor.insertInto('codeScan').values({ codeEnvId, status: 'SCAN-PENDING' }).execute()
    completeFakeCodeScan(codeEnvId)
}
