/** The most screenshots a follow-up's brief takes. */
export const MAX_FOLLOW_UP_IMAGES = 5;

/** The largest screenshot a follow-up takes: 2 MiB. */
export const MAX_FOLLOW_UP_IMAGE_BYTES = 2 * 1024 * 1024;

/** The most bytes of screenshots a brief takes in all: 6 MiB, so the artifacts stay under what a worker returns. */
export const MAX_FOLLOW_UP_IMAGES_TOTAL_BYTES = 6 * 1024 * 1024;

const FOLLOW_UP_IMAGE_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
];

/** Why a file chosen or pasted cannot be a follow-up's screenshot, before it is sent; null when it can. */
export function followUpImageRefusal(file: {
  readonly type: string;
  readonly size: number;
}): string | null {
  if (!FOLLOW_UP_IMAGE_TYPES.includes(file.type))
    return 'Only PNG, JPEG, WebP and GIF images can be added.';
  if (file.size === 0) return 'The image is empty.';
  if (file.size > MAX_FOLLOW_UP_IMAGE_BYTES)
    return 'The image is larger than 2 MB.';
  return null;
}

/**
 * The files a brief can take, in order, up to `room` more screenshots, and why the first one left out cannot be added;
 * the refusal is null when every file was taken.
 */
export function acceptFollowUpImages<
  F extends { readonly type: string; readonly size: number },
>(
  files: readonly F[],
  room: number
): { readonly images: readonly F[]; readonly refusal: string | null } {
  const images: F[] = [];
  let refusal: string | null = null;
  for (const file of files) {
    const why =
      followUpImageRefusal(file) ??
      (images.length >= room
        ? `A follow-up takes at most ${MAX_FOLLOW_UP_IMAGES} screenshots.`
        : null);
    if (why === null) images.push(file);
    else refusal ??= why;
  }
  return { images, refusal };
}
