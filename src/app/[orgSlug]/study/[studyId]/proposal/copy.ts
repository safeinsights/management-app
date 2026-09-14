// Shared by the Step 2 proposal page and the Edit proposal page, which the card requires to read
// identically (OTTER-691, OTTER-762).

export const proposalIntroText = (orgName: string) =>
    `Submit your proposal to ${orgName} for review. They will assess its feasibility, scientific value, and potential impact on instructional practice. After review, they may approve it, request revisions, or decline it.`

export const datasetsDescription = (orgName: string) =>
    `Select the datasets available through ${orgName} for this study.`

export const confirmSubmitBody = (orgName: string) =>
    `Your proposal will be sent to ${orgName} for review. You will not be able to make changes once submitted.`
