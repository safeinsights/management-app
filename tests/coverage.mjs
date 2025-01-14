export const SOURCE_MATCHER = /src\/(app|components|lib|server)\//

export function testsCoverageSourceFilter(sourcePath) {
    return sourcePath.search(SOURCE_MATCHER) !== -1
}
