// Fixed so a re-run can tell which sample rows exist. Kept clear of the test-user
// (...0000000000xx) and org (...00000000010x) ids in 1743608138837_test_users.ts.
const sampleUuid = (n: number) => `00000000-0000-4000-8000-00000001${n.toString(16).padStart(4, '0')}`

export const studyId = (n: number) => sampleUuid(n * 16)
export const jobId = (n: number) => sampleUuid(n * 16 + 1)
export const legalDocumentId = (n: number) => sampleUuid(n * 16 + 2)
export const legalVersionId = (n: number) => sampleUuid(n * 16 + 3)
// slot 0..11 lands in the study's own block of 16
export const fileId = (n: number, slot: number) => sampleUuid(n * 16 + 4 + slot)
export const fakeUserId = (n: number) => sampleUuid(0x1000 + n)
