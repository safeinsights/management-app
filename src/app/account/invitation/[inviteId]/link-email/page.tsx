'use client'

import { FC, use } from 'react'
import { InvalidInvitePanel } from '../invalid-invite-panel'
import { LinkEmailView } from './link-email-view'
import { useLinkInviteEmail } from './use-link-invite-email'

type LinkEmailProps = {
    params: Promise<{ inviteId: string }>
}

const LinkEmail: FC<LinkEmailProps> = ({ params }) => {
    const { inviteId } = use(params)
    const { status, isInviteInvalid, invitedEmail, orgName, failureMessage, form, verify, resendCode, skip, continueToOrg } =
        useLinkInviteEmail(inviteId)

    // The invite is already claimed by the time this page loads, so a lookup that resolves nothing
    // means the id is not this account's to finish.
    if (isInviteInvalid) {
        return <InvalidInvitePanel />
    }

    return (
        <LinkEmailView
            status={status}
            invitedEmail={invitedEmail}
            orgName={orgName}
            failureMessage={failureMessage}
            form={form}
            onVerify={verify}
            onResend={resendCode}
            onSkip={skip}
            onContinue={continueToOrg}
        />
    )
}

export default LinkEmail
