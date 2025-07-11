/**
 * This file was generated by kysely-codegen.
 * Please do not edit it manually.
 */

import type { ColumnType } from 'kysely'

export type AuditEventType =
    | 'ACCEPTED_INVITE'
    | 'APPROVED'
    | 'CREATED'
    | 'DELETED'
    | 'INVITED'
    | 'LOGGED_IN'
    | 'REJECTED'
    | 'RESET_PASSWORD'
    | 'UPDATED'

export type AuditRecordType = 'STUDY' | 'USER'

export type FileType =
    | 'APPROVED-LOG'
    | 'APPROVED-RESULT'
    | 'ENCRYPTED-LOG'
    | 'ENCRYPTED-RESULT'
    | 'MAIN-CODE'
    | 'SUPPLEMENTAL-CODE'

export type Generated<T> =
    T extends ColumnType<infer S, infer I, infer U> ? ColumnType<S, I | undefined, U> : ColumnType<T, T | undefined, T>

export type Json = JsonValue

export type JsonArray = JsonValue[]

export type JsonObject = {
    [x: string]: JsonValue | undefined
}

export type JsonPrimitive = boolean | number | string | null

export type JsonValue = JsonArray | JsonObject | JsonPrimitive

export type Language = 'R'

export type StudyJobStatus =
    | 'CODE-APPROVED'
    | 'CODE-REJECTED'
    | 'CODE-SUBMITTED'
    | 'FILES-APPROVED'
    | 'FILES-REJECTED'
    | 'INITIATED'
    | 'JOB-ERRORED'
    | 'JOB-PACKAGING'
    | 'JOB-PROVISIONING'
    | 'JOB-READY'
    | 'JOB-RUNNING'
    | 'RUN-COMPLETE'

export type StudyStatus = 'APPROVED' | 'ARCHIVED' | 'INITIATED' | 'PENDING-REVIEW' | 'REJECTED'

export type Timestamp = ColumnType<Date, Date | string, Date | string>

export interface Audit {
    createdAt: Generated<Timestamp>
    eventType: AuditEventType
    id: Generated<string>
    metadata: Json | null
    recordId: string
    recordType: AuditRecordType
    userId: string
}

export interface JobStatusChange {
    createdAt: Generated<Timestamp>
    id: Generated<string>
    message: string | null
    status: Generated<StudyJobStatus>
    studyJobId: string
    userId: string | null
}

export interface Org {
    createdAt: Generated<Timestamp>
    description: string | null
    email: string
    id: Generated<string>
    name: string
    publicKey: string
    slug: string
    updatedAt: Generated<Timestamp>
}

export interface OrgBaseImage {
    cmdLine: string
    createdAt: Generated<Timestamp>
    id: Generated<string>
    isTesting: Generated<boolean>
    language: Language
    name: string
    orgId: string
    url: string
}

export interface OrgUser {
    id: Generated<string>
    isAdmin: boolean
    isResearcher: Generated<boolean>
    isReviewer: boolean
    joinedAt: Generated<Timestamp>
    orgId: string
    userId: string
}

export interface PendingUser {
    claimedByUserId: string | null
    createdAt: Generated<Timestamp>
    email: string
    id: Generated<string>
    isResearcher: boolean
    isReviewer: boolean
    orgId: string
}

export interface Study {
    agreementDocPath: string | null
    approvedAt: Timestamp | null
    containerLocation: string
    createdAt: Generated<Timestamp>
    dataSources: Generated<string[]>
    descriptionDocPath: string | null
    id: Generated<string>
    irbDocPath: string | null
    irbProtocols: string | null
    orgId: string
    outputMimeType: string | null
    piName: string
    rejectedAt: Timestamp | null
    researcherId: string
    reviewerId: string | null
    status: Generated<StudyStatus>
    title: string
}

export interface StudyJob {
    createdAt: Generated<Timestamp>
    id: Generated<string>
    language: Language
    studyId: string
}

export interface StudyJobFile {
    createdAt: Generated<Timestamp>
    fileType: FileType
    id: Generated<string>
    name: string
    path: string
    sourceId: string | null
    studyJobId: string
}

export interface User {
    clerkId: string
    createdAt: Generated<Timestamp>
    email: string | null
    firstName: string
    fullName: Generated<string>
    id: Generated<string>
    lastName: string | null
    updatedAt: Generated<Timestamp>
}

export interface UserPublicKey {
    createdAt: Generated<Timestamp>
    fingerprint: string
    id: Generated<string>
    publicKey: Buffer
    updatedAt: Generated<Timestamp>
    userId: string
}

export interface DB {
    audit: Audit
    jobStatusChange: JobStatusChange
    org: Org
    orgBaseImage: OrgBaseImage
    orgUser: OrgUser
    pendingUser: PendingUser
    study: Study
    studyJob: StudyJob
    studyJobFile: StudyJobFile
    user: User
    userPublicKey: UserPublicKey
}
