import { SignedIn, SignedOut } from '@clerk/nextjs'
import { LoginOrSignup } from '@/components/login-or-signup'
import { footerStyles, mainStyles, pageStyles } from './page.css'
import Link from 'next/link'
import { db } from '@/database'
import { unstable_noStore as noStore } from 'next/cache'
import {
    Button,
    Title,
    Group,
    Paper,
    Container,
    Stack,
    CloseButton,
    Text,
    TextInput,
    Checkbox,
    PasswordInput,
    Anchor,
    Flex,
    rem,
} from '@mantine/core'

export default async function Home() {
    return (
        <div className={pageStyles}>
            <SignedOut>
                <LoginOrSignup />
            </SignedOut>
            <SignedIn>
                <main className={mainStyles}>
                    Hello World, found 0 records
                    <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} mb={-30} radius="sm ">
                        <Title>Welcome to the SafeInsights management app.</Title>
                        <Title order={4}>You likely want to visit the OpenStax study proposal page.</Title>
                        <Link href="/member/openstax/study-request" passHref />
                        <Button>Proceed to study proposal</Button>
                    </Paper>
                    <Paper bg="#f5f5f5" shadow="none" p={30} radius="sm">
                        <TextInput
                            label="Login"
                            placeholder="Email address or phone number"
                            aria-label="Email address or phone number"
                        />
                        <PasswordInput mt={10} placeholder="Password" aria-label="Password" />
                        <Group>
                            <Checkbox mt={5} label="Remember me" aria-label="Remember me" />
                            <Anchor href="https://www.safeinsights.org/" target="_blank" mt={5}>
                                Forgot password?
                            </Anchor>
                        </Group>
                    </Paper>
                </main>
            </SignedIn>

            <footer className={footerStyles}>A SafeInsights production</footer>
        </div>
    )
}
