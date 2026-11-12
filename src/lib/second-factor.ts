// Clerk's fva claim: minutes since each factor was last verified, -1 for never. Enrolling a factor
// leaves it at -1; only passing the second factor, at sign-in or on reverification, sets it.
export function hasVerifiedSecondFactor(fva: readonly [number, number] | null | undefined): boolean {
    return fva != null && fva[1] >= 0
}
