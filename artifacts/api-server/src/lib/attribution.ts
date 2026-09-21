/**
 * What to call money that belongs to nobody in particular.
 *
 * A deposit with no member named is not one person's contribution: it is the
 * group's, and it is reported on its own line rather than credited to anybody.
 * It was called "Joint bank", which read as a pooled account — a word already
 * taken on that screen by the actual bank accounts.
 *
 * One constant so the wording can be changed in one place. Nothing is stored:
 * the absence of a member is stored, and this is only how that absence reads.
 */
export const GROUP_ATTRIBUTION = "The group";
