'use client'

import { SignedIn, SignedOut, useUser, OrganizationSwitcher } from '@clerk/nextjs'
import { SignIn } from '@/components/signin'
import { useOrganization } from '@clerk/nextjs'
import { footerStyles, mainStyles, pageStyles } from './page.css'
import Link from 'next/link'
import { Button, Title, Paper, Flex } from '@mantine/core'

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
                    <OrganizationSwitcher 
                        afterCreateOrganizationUrl="/"
                        afterLeaveOrganizationUrl="/"
                        afterSelectOrganizationUrl="/"
                        hidePersonal={true}
                    />
                    <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} mb={-30} radius="sm">
                        <Title>Welcome to the SafeInsights management app.</Title>
                        <Title order={4}>You likely want to visit the OpenStax study proposal page.</Title>
                        <Link href="/researcher/study/request/openstax" passHref>
                            <Button>Proceed to study proposal</Button>
                        </Link>
                    </Paper>
                </main>
            </SignedIn>

            <footer className={footerStyles}>A SafeInsights production</footer>
        </div>
    )
}
