'use client'

import { SignedIn, SignedOut, useOrganizationList, useUser } from '@clerk/nextjs'
import { SignIn } from '@/components/signin'
import { footerStyles, mainStyles, pageStyles } from './page.css'
import Link from 'next/link'
import { Button, Title, Paper, Flex } from '@mantine/core'

export default function Home() {
    const { user } = useUser()

    const SAFEINSIGHTS_ORG_ID = 'org_2oUWxfZ5UDD2tZVwRmMF8BpD2rD'
    const isSiMember = user?.organizationMemberships?.some(
        membership => membership.organization.id === SAFEINSIGHTS_ORG_ID
    )
    
    const isResearcher = user?.organizationMemberships?.some(
        membership => membership.role === 'researcher'
    )
    
    console.log('Current user:', user)
    console.log(`Current User is member of org SafeInsights: ${isSiMember ? 'yes' : 'no'}`)
    console.log(`Current User is a Researcher: ${isResearcher ? 'yes' : 'no'}`)
    return (
        <div className={pageStyles}>
            <SignedOut>
                <Flex justify="center" miw="400px">
                    <SignIn />
                </Flex>
            </SignedOut>
            <SignedIn>
                <main className={mainStyles}>
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
