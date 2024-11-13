import { SignedIn, SignedOut } from '@clerk/nextjs'
import { SignIn } from '@/components/signin'
import { footerStyles, mainStyles, pageStyles } from './page.css'
import { Title, Flex } from '@mantine/core'
import { UserNav } from './user-nav'

export default async function Home() {
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
