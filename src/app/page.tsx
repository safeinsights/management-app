import { SignedIn, SignedOut } from '@clerk/nextjs'
import { LoginOrSignup } from '@/components/login-or-signup'
import { footerStyles, mainStyles, pageStyles } from './page.css'
import Link from 'next/link'
import { Button, Title, Paper } from '@mantine/core'

export default async function Home() {
    return (
        <div className={pageStyles}>
            <SignedOut>
                <LoginOrSignup />
            </SignedOut>
            <SignedIn>
                <main className={mainStyles}>
                    <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} mb={-30} radius="sm">
                        <Title>Welcome to the SafeInsights management app.</Title>
                        <Title order={4}>You likely want to visit the OpenStax study proposal page.</Title>
                        <Link href="/member/openstax/study-request" passHref>
                            <Button>Proceed to study</Button>
                        </Link>
                    </Paper>
                </main>
            </SignedIn>

            <footer className={footerStyles}>A SafeInsights production</footer>
        </div>
    )
}
