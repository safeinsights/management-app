'use client'

import { FC } from 'react'
import { InvalidInvitePanel } from '../invalid-invite-panel'
import { LinkEmailView } from './link-email-view'
import { useLinkInviteEmail } from './use-link-invite-email'

export const LinkEmailPanel: FC<{ inviteId: string }> = ({ inviteId }) => {
    const {
        status,
        isInviteInvalid,
        invitedEmail,
        orgName,
        failureMessage,
        form,
        verify,
        resendCode,
        skip,
        continueToOrg,
    } = useLinkInviteEmail(inviteId)

    // The invite is already claimed by the time this screen loads, so a lookup that resolves nothing
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
