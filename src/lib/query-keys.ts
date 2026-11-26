import type { LegalDocumentType } from '@/database/types'
import type {
    GlobalLegalDocumentType,
    LegalDocumentAcknowledgementSort,
    OrgStudyAgreementSort,
    ParticipationAgreementType,
    UserStudyAgreementSort,
} from '@/schema/legal-document'

type UserSort = { columnAccessor: string; direction: string }

// Every React Query key in the app. React Query matches keys by prefix, so study data lives under
// study(studyId) and job data under job(jobId): one invalidation of the prefix refreshes all of it.
export const queryKeys = {
    study: (studyId: string) => ['study', studyId] as const,
    mainCodeFile: (studyId: string) => ['study', studyId, 'main-code-file'] as const,
    workspaceFiles: (studyId: string) => ['study', studyId, 'workspace-files'] as const,
    lastJob: (studyId: string) => ['study', studyId, 'last-job'] as const,
    starterCodeInfo: (studyId: string) => ['study', studyId, 'starter-code-info'] as const,
    workspaceBuildStatus: (studyId: string) => ['study', studyId, 'workspace-build-status'] as const,
    ideOwner: (studyId: string) => ['study', studyId, 'ide-owner'] as const,
    studyResearcherProfile: (studyId: string, userId: string) =>
        ['study', studyId, 'researcher-profile', userId] as const,
    // Shared by the layout's gate and the proposal step's notice, so one request answers both.
    studyAgreement: (studyId: string) => ['study', studyId, 'agreement'] as const,

    jobAll: () => ['job'] as const,
    job: (jobId: string) => ['job', jobId] as const,
    jobCodeFile: (jobId: string, fileName: string | null) => ['job', jobId, 'code-file', fileName] as const,
    // A resubmit reuses the job id, so the round's submit time keeps the previous round's analysis
    // from being served as current (OTTER-775 review).
    jobAnalysis: (jobId: string, submittedAtMs: number) => ['job', jobId, 'analysis', submittedAtMs] as const,
    jobFileActivity: (jobId: string, orgSlug: string) => ['job', jobId, 'file-activity', orgSlug] as const,
    // Role is part of the key so a dual-role user is not served the other role's cache.
    jobEncryptedFiles: (jobId: string, role: 'researcher' | 'reviewer', fingerprint?: string) =>
        ['job', jobId, 'encrypted-files', role, fingerprint ?? 'current'] as const,

    studyTables: () => ['studies'] as const,
    researcherOrgStudiesAll: () => ['studies', 'researcher-org'] as const,
    researcherOrgStudies: (orgSlug: string) => ['studies', 'researcher-org', orgSlug] as const,
    researcherUserStudies: () => ['studies', 'researcher-user'] as const,
    reviewerOrgStudiesAll: () => ['studies', 'reviewer-org'] as const,
    reviewerOrgStudies: (orgSlug: string) => ['studies', 'reviewer-org', orgSlug] as const,
    reviewerUserStudies: (userId: string) => ['studies', 'reviewer-user', userId] as const,

    navUnreadAll: () => ['nav-unread'] as const,
    navUnread: (userId: string | undefined) => ['nav-unread', userId] as const,
    currentUserInfoAll: () => ['current-user-info'] as const,
    currentUserInfo: (clerkUserId: string | undefined) => ['current-user-info', clerkUserId] as const,
    userOrgs: () => ['user-orgs'] as const,
    researcherProfile: () => ['researcher-profile'] as const,
    linkPreview: (pathname: string | null) => ['link-preview', pathname] as const,

    orgs: () => ['orgs'] as const,
    agentContext: (name: string, orgId: string | null) => ['agent-context', name, orgId] as const,
    orgsWithLanguages: () => ['orgs-with-languages'] as const,

    orgLanguages: (orgSlug: string) => ['org', orgSlug, 'languages'] as const,
    orgDataSources: (orgSlug: string) => ['org', orgSlug, 'data-sources'] as const,
    orgCodeEnvs: (orgSlug: string) => ['org', orgSlug, 'code-envs'] as const,
    orgCodeEnvHistory: (orgSlug: string, codeEnvId: string) => ['org', orgSlug, 'code-env-history', codeEnvId] as const,
    orgTestLabs: (orgSlug: string) => ['org', orgSlug, 'test-labs'] as const,
    orgEligibleTestLabs: (orgSlug: string) => ['org', orgSlug, 'eligible-test-labs'] as const,
    orgPendingUsers: (orgSlug: string) => ['org', orgSlug, 'pending-users'] as const,
    orgUsersAll: (orgSlug: string) => ['org', orgSlug, 'users'] as const,
    orgUsers: (orgSlug: string, sort: UserSort) => ['org', orgSlug, 'users', sort] as const,

    inviteOrgInfo: (inviteId: string) => ['invite', inviteId, 'org-info'] as const,
    inviteClaim: (inviteId: string) => ['invite', inviteId, 'claim'] as const,

    legal: {
        versions: (scope: { type: LegalDocumentType; orgId?: string; studyId?: string }) =>
            ['legal', 'document-versions', scope.type, scope.orgId, scope.studyId] as const,
        // A prefix of the above, so invalidating after a publish reaches every scope of that type.
        versionsForType: (type: LegalDocumentType) => ['legal', 'document-versions', type] as const,
        nextPendingAcknowledgement: () => ['legal', 'next-pending-acknowledgement'] as const,
        // Read by the signup form before an account exists, so there is no session to key it by.
        globalDocuments: () => ['legal', 'global-documents'] as const,
        participationAgreementForInvite: (inviteId: string) =>
            ['legal', 'participation-agreement-for-invite', inviteId] as const,
        documentContent: (versionId: string) => ['legal', 'document-content', versionId] as const,
        // Sort is part of the key because the action orders the rows, so a re-sort is a new read.
        acknowledgements: (type: LegalDocumentType, sort: LegalDocumentAcknowledgementSort) =>
            ['legal', 'acknowledgements', type, sort.columnAccessor, sort.direction] as const,
        participationAgreements: (type: ParticipationAgreementType) =>
            ['legal', 'participation-agreements', type] as const,
        participationSignatories: (type: ParticipationAgreementType) =>
            ['legal', 'participation-signatories', type] as const,
        studyAgreements: () => ['legal', 'study-agreements'] as const,
        studiesAwaitingStudyAgreement: () => ['legal', 'studies-awaiting-study-agreement'] as const,
        orgStudyAgreements: (orgSlug: string, sort: OrgStudyAgreementSort) =>
            ['legal', 'org-study-agreements', orgSlug, sort.columnAccessor, sort.direction] as const,
        orgParticipationAgreement: (orgSlug: string) => ['legal', 'org-participation-agreement', orgSlug] as const,
        userStudyAgreements: (sort: UserStudyAgreementSort) =>
            ['legal', 'user-study-agreements', sort.columnAccessor, sort.direction] as const,
        userParticipationAgreements: (type: ParticipationAgreementType) =>
            ['legal', 'user-participation-agreements', type] as const,
        userGlobalDocument: (type: GlobalLegalDocumentType) => ['legal', 'user-global-document', type] as const,
        // Prefixes rather than whole keys: the tables carry their sort in the key, and an
        // acknowledgement changes what every sort of them shows.
        agreementTablePrefixes: () =>
            [
                ['legal', 'user-study-agreements'],
                ['legal', 'user-participation-agreements'],
                ['legal', 'org-study-agreements'],
                ['legal', 'org-participation-agreement'],
            ] as const,
    },
}
