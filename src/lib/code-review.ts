export function codeReviewHeading(reviewVersion: number): string {
    return reviewVersion > 1 ? `Review code v${reviewVersion}.0` : 'Review code'
}
