import type { Metadata } from 'next'
import { AddSMSMFA } from './add-sms-mfa'

export const metadata: Metadata = { title: 'SMS verification' }

// https://clerk.com/docs/custom-flows/add-phone
export default function ManageSMSMFA() {
    return <AddSMSMFA />
}
