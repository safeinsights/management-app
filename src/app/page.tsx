'use client'

import { SignedIn, SignedOut, useUser } from '@clerk/nextjs'
import { SignIn } from '@/components/signin'
import { useOrganization } from '@clerk/nextjs'
import { footerStyles, mainStyles, pageStyles } from './page.css'
import { Title, Flex } from '@mantine/core'
import { UserNav } from './user-nav'

export default function Home() {
    const { user } = useUser()
    const { organization } = useOrganization()
    
    const OPENSTAX_ORG_ID = 'org_2ohzjhfpKp4QqubW86FfXzzDm2I'
    
    const isOrgMember = organization?.id === OPENSTAX_ORG_ID
    const isSiMember = isOrgMember && organization?.membership?.role === 'org:si_member'
    const isAdmin = isOrgMember && organization?.membership?.role === 'org:admin'

    console.log('Current organization:', organization)
    console.log(`Active in openstax org: ${isOrgMember ? 'yes' : 'no'}`)
    console.log(`Is si_member: ${isSiMember ? 'yes' : 'no'}`)
    return (
        <div className={pageStyles}>
            <SignedOut>
                <Flex justify="center" miw="400px">
                    <SignIn />
                </Flex>
            </SignedOut>
            <SignedIn>
                <main className={mainStyles}>
                    <Title>Welcome to the SafeInsights management app.</Title>
                    <UserNav />
                </main>
            </SignedIn>

            <footer className={footerStyles}>A SafeInsights production</footer>
        </div>
    )
}
