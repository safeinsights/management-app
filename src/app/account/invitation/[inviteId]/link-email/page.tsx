'use client'

import { FC, use } from 'react'
import { LinkEmailPanel } from './link-email-panel'

const LinkEmail: FC<{ params: Promise<{ inviteId: string }> }> = ({ params }) => {
    const { inviteId } = use(params)

    return <LinkEmailPanel inviteId={inviteId} />
}

export default LinkEmail
