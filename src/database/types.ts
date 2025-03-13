/**
 * This file was generated by kysely-codegen.
 * Please do not edit it manually.
 */

import type { ColumnType } from 'kysely'

export type Generated<T> =
    T extends ColumnType<infer S, infer I, infer U> ? ColumnType<S, I | undefined, U> : ColumnType<T, T | undefined, T>

export type ResultFormat = 'SI_V1_ENCRYPT'

export type StudyJobStatus =
    | 'CODE-APPROVED'
    | 'CODE-REJECTED'
    | 'CODE-SUBMITTED'
    | 'INITIATED'
    | 'JOB-ERRORED'
    | 'JOB-PACKAGING'
    | 'JOB-PROVISIONING'
    | 'JOB-READY'
    | 'JOB-RUNNING'
    | 'RESULTS-APPROVED'
    | 'RESULTS-REJECTED'
    | 'RUN-COMPLETE'

export type StudyStatus = 'APPROVED' | 'ARCHIVED' | 'INITIATED' | 'PENDING-REVIEW' | 'REJECTED'

export type Timestamp = ColumnType<Date, Date | string, Date | string>

export interface JobStatusChange {
    createdAt: Generated<Timestamp>
    id: Generated<string>
    message: string | null
    status: Generated<StudyJobStatus>
    studyJobId: string
    userId: string | null
}

export interface Member {
    createdAt: Generated<Timestamp>
    email: string
    id: Generated<string>
    identifier: string
    name: string
    publicKey: string
    updatedAt: Generated<Timestamp>
}

export interface MemberUser {
    id: Generated<string>
    isAdmin: boolean
    isReviewer: boolean
    joinedAt: Generated<Timestamp>
    memberId: string
    userId: string
}

export interface MemberUserPublicKey {
    createdAt: Generated<Timestamp>
    fingerprint: string
    id: Generated<string>
    updatedAt: Generated<Timestamp>
    userId: string
    value: string
}

export interface Study {
    approvedAt: Timestamp | null
    containerLocation: string
    createdAt: Generated<Timestamp>
    dataSources: Generated<string[]>
    description: string
    id: Generated<string>
    irbProtocols: string | null
    memberId: string
    outputMimeType: string | null
    piName: string
    rejectedAt: Timestamp | null
    researcherId: string
    status: Generated<StudyStatus>
    title: string
}

export interface StudyJob {
    createdAt: Generated<Timestamp>
    id: Generated<string>
    resultFormat: ResultFormat | null
    resultsPath: string | null
    studyId: string
}

export interface User {
    clerkId: string
    createdAt: Generated<Timestamp>
    id: Generated<string>
    isResearcher: Generated<boolean>
    name: string
    updatedAt: Generated<Timestamp>
}

export interface DB {
    jobStatusChange: JobStatusChange
    member: Member
    memberUser: MemberUser
    memberUserPublicKey: MemberUserPublicKey
    study: Study
    studyJob: StudyJob
    user: User
}
