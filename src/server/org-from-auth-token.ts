import { headers } from 'next/headers'

import { db } from '@/database'
import jwt from 'jsonwebtoken'
import { Org } from '@/schema/org'

export const orgFromAuthToken = async (): Promise<Org | null> => {
    const authHeader = (await headers()).get('Authorization') || ''

    // Check if the Authorization header is present and well-formed
    if (!authHeader.startsWith('Bearer ')) {
        return null
    }

    const token = authHeader.replace('Bearer ', '')
    try {
        const values = jwt.decode(token, { json: true })

        const orgSlug = values?.iss
        if (!orgSlug) {
            return null
        }

        const org = await db.selectFrom('org').selectAll().where('slug', '=', orgSlug).executeTakeFirst()
        if (!org) {
            return null
        }

        // Verify and decode the JWT
        const decodedToken = jwt.verify(token, org.publicKey, { algorithms: ['RS256'] })

        if (!decodedToken) {
            return null
        }

        return org
    } catch {
        return null
    }
}
