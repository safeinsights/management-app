import type { Metadata } from 'next'
import { AddAppMFA } from './add-app-mfa'

export const metadata: Metadata = { title: 'Authenticator app verification' }

export default function AddMFAPage() {
    return <AddAppMFA />
}
