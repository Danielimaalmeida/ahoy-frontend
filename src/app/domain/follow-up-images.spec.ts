import {
  MAX_FOLLOW_UP_IMAGE_BYTES,
  acceptFollowUpImages,
  followUpImageRefusal,
} from './follow-up-images';

const png = (size = 1000) => ({ type: 'image/png', size });

describe('followUpImageRefusal', () => {
  it('takes the four raster formats up to 2 MiB', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
      expect(followUpImageRefusal({ type, size: 10 })).toBeNull();
    expect(followUpImageRefusal(png(MAX_FOLLOW_UP_IMAGE_BYTES))).toBeNull();
  });

  it('refuses SVG, an empty file and one over 2 MiB', () => {
    expect(followUpImageRefusal({ type: 'image/svg+xml', size: 10 })).toMatch(
      /PNG, JPEG, WebP and GIF/
    );
    expect(followUpImageRefusal(png(0))).toBe('The image is empty.');
    expect(followUpImageRefusal(png(MAX_FOLLOW_UP_IMAGE_BYTES + 1))).toBe(
      'The image is larger than 2 MB.'
    );
  });
});

describe('acceptFollowUpImages', () => {
  it('takes the files that fit and says why the first other one did not', () => {
    const files = [png(), { type: 'text/plain', size: 3 }, png(), png()];
    const { images, refusal } = acceptFollowUpImages(files, 2);
    expect(images).toEqual([files[0], files[2]]);
    expect(refusal).toMatch(/Only PNG/);
  });

  it('says the limit when there is no room', () => {
    const { images, refusal } = acceptFollowUpImages([png()], 0);
    expect(images).toEqual([]);
    expect(refusal).toBe('A follow-up takes at most 5 screenshots.');
  });
});
