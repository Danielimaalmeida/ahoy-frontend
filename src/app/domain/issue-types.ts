/** What Jira's issue type says about a voyage. Pure. */

/**
 * Whether Jira's issue type names a defect ("Bug", "Defect", "Defeito"), as `ahoy-hosted`'s `isDefectType` reads it;
 * null or absent (before intake, or an older server) is not.
 */
export function isDefectType(issueType: string | null | undefined): boolean {
  return (
    typeof issueType === 'string' &&
    /^(?:bug|defect|defeito)$/iu.test(issueType.trim())
  );
}
