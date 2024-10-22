import { SignedIn, SignedOut } from '@clerk/nextjs'
import { SignIn } from '@/components/signin'
import { footerStyles, mainStyles, pageStyles } from './page.css'
import { db } from '@/database'
import { unstable_noStore as noStore } from 'next/cache'
import { Flex } from '@mantine/core'

async function getDB() {
    noStore()
    return await db.selectFrom('study').select('title').execute()
}

export default async function Home() {
    const studies = await getDB()
    return (
        <div className={pageStyles}>
            <SignedOut>
                <Flex justify="center" miw="400px">
                    <SignIn />
                </Flex>
            </SignedOut>
            <SignedIn>
                <main className={mainStyles}>
                    Hello World, found {studies.length} records
                </main>
            </SignedIn>
            <footer className={footerStyles}>A SafeInsights production</footer>
        </div>
    )
}
