import { ErrorAlert } from '@/components/errors'
import { ClerkProvider } from '@clerk/nextjs'
import { EditorLayoutShell } from './shell'

type Props = {
    children: React.ReactNode
}

export default async function EditorLayout({ children }: Props) {

    const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''
    if (!clerkPublishableKey) return <ErrorAlert error={'missing clerk key'} />

    return (
        <ClerkProvider publishableKey={clerkPublishableKey}>
            <EditorLayoutShell>{children}</EditorLayoutShell>
        </ClerkProvider>
    )
}
