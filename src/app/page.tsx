import { SignedIn, SignedOut } from '@clerk/nextjs'
import { SignIn } from '@/components/signin'
import { Title, Flex } from '@mantine/core'
import { UserNav } from './user-nav'
import { pageStyles, mainStyles, footerStyles } from '@/styles/common'

export default function Home() {
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
