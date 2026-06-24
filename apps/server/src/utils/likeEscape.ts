/**
 * Escape LIKE wildcard characters (% and _) in search keywords.
 * Prisma's `contains` filter translates to SQL `ILIKE %keyword%`,
 * so unescaped % or _ in the keyword would act as wildcards.
 */
export function escapeLikeWildcards(keyword: string): string {
  return keyword
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}
