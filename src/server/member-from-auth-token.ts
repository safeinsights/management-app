import { headers } from 'next/headers'

import { db } from '@/database'
import jwt from 'jsonwebtoken'
import { Member } from '@/schema/member'

export const memberFromAuthToken = async (): Promise<Member | null> => {
    const authHeader = (await headers()).get('Authorization') || ''

    // Check if the Authorization header is present and well-formed
    if (!authHeader.startsWith('Bearer ')) {
        return null
    }

    const token = authHeader.replace('Bearer ', '')
    try {
        const values = jwt.decode(token, { json: true })

        const memberIdentifier = values?.iss
        if (!memberIdentifier) {
            return null
        }

        const member = await db
            .selectFrom('member')
            .selectAll()
            .where('identifier', '=', memberIdentifier)
            .executeTakeFirst()
        if (!member) {
            return null
        }

        // Verify and decode the JWT
        const decodedToken = jwt.verify(token, member.publicKey, { algorithms: ['RS256'] })

        if (!decodedToken) {
            return null
        }

        return member
    } catch {
        return null
    }
}
