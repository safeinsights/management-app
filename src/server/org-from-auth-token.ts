import { headers } from 'next/headers'

import { db } from '@/database'
import jwt from 'jsonwebtoken'
import { Org } from '@/schema/org'

export const orgFromAuthToken = async (): Promise<Org> => {
    const authHeader = (await headers()).get('Authorization') || ''

    // Check if the Authorization header is present and well-formed
    if (!authHeader.startsWith('Bearer ')) {
        throw new Error('Header missing or not well formed')
    }

    const token = authHeader.replace('Bearer ', '')

    const values = jwt.decode(token, { json: true })

    const orgSlug = values?.iss
    if (!orgSlug) {
        throw new Error('Missing org slug')
    }

    const org = await db.selectFrom('org').selectAll('org').where('slug', '=', orgSlug).executeTakeFirst()
    if (!org) {
        throw new Error('Org not found')
    }

    // Verify and decode the JWT
    const decodedToken = jwt.verify(token, org.publicKey, { algorithms: ['RS256'] })

    if (!decodedToken) {
        throw new Error('Token must exist')
    }

    return org
}
