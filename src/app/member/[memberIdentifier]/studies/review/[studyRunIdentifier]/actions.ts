'use server'

import { db } from '@/database'
import { revalidatePath } from 'next/cache'

export const approveStudyRunAction = async (runId: string) => {
    // TODO: check clerk session to ensure researcher can actually update this

    await db
        .updateTable('studyRun')
        .set({
            status: 'pending',
        })
        .where('id', '=', runId)
        .executeTakeFirstOrThrow()

    revalidatePath('/member/[memberIdentifier]/studies')
}
