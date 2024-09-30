import React from 'react'
import { footerStyles, mainStyles, pageStyles } from './page.css'
import { db } from '@/database'
import { unstable_noStore as noStore } from 'next/cache'

async function getDB() {
    return await db.selectFrom('study').select('title').execute()
}

const Body: React.FC<{ studies: Awaited<ReturnType<typeof getDB>> }> = ({ studies }) => {
    return (
        <div className={pageStyles}>
            <main className={mainStyles}>Hello World, found {studies.length} records</main>
            <footer className={footerStyles}>A SafeInsights production</footer>
        </div>
    )
}

export default async function Home() {
    noStore()

    const recs = await getDB()

    return <Body studies={recs} />
}
