import { SignedIn, SignedOut } from '@clerk/nextjs'
import { LoginOrSignup } from '@/components/login-or-signup'
import { footerStyles, mainStyles, pageStyles } from './page.css'
import { db } from '@/database'
import { unstable_noStore as noStore } from 'next/cache'
import { Group, Paper, CloseButton, Text, TextInput, Checkbox, PasswordInput, Anchor } from '@mantine/core'

async function getDB() {
    return await db.selectFrom('study').select('title').execute()
}

const Body: React.FC<{ studies: Awaited<ReturnType<typeof getDB>> }> = ({ studies }) => {
    return (
        <div className={pageStyles}>
            <SignedOut>
                <LoginOrSignup />
            </SignedOut>
            <SignedIn>
                <main className={mainStyles}>
                    Hello World, found {studies.length} records
                    <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} mb={-30} radius="sm ">
                        <Group justify="space-between" gap="xl">
                            <Text ta="left">Welcome To SafeInsights</Text>
                            <CloseButton aria-label="Close form" />
                        </Group>
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

export default async function Home() {
    noStore()

    const recs = await getDB()

    return <Body studies={recs} />
}
