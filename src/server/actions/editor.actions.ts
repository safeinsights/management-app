'use server'

import { db } from '@/database'

export async function getYjsDocumentUpdatedAtAction(documentName: string): Promise<string | null> {
    const row = await db
        .selectFrom('yjsDocument')
        .select('updatedAt')
        .where('name', '=', documentName)
        .executeTakeFirst()

    return row?.updatedAt?.toISOString() ?? null
}
