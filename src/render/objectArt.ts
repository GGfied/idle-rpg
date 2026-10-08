/**
 * Pixel-art rectangles of the static world objects (1x art px, origin = feet, y up is negative).
 * Pure data so tests can check the drawing against the hit bounds without Phaser.
 */
export interface ObjectRect {
  color: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Drawn extents (px) the hit bounds derive from. */
export const CHEST_HALF_W = 14;
export const CHEST_TOP = 22;
export const BOOTH_HALF_W = 15;
export const BOOTH_COUNTER_TOP = 18;
export const BOOTH_SIGN_TOP = 28;

const r = (color: number, x: number, y: number, w: number, h: number): ObjectRect => ({
  color,
  x,
  y,
  w,
  h,
});

/** Bank chest: warm wood, silver bands, gold lock plate. */
const BANK_CHEST: ObjectRect[] = [
  r(0x7a4a22, -12, -18, 24, 16), // body
  r(0x93602d, -12, -CHEST_TOP, 24, 6), // lid
  r(0x5a3216, -12, -17, 24, 1), // lid seam
  r(0x9aa0a8, -9, -22, 3, 20),
  r(0x9aa0a8, 6, -22, 3, 20), // metal bands
  r(0xe0b84a, -2, -19, 4, 5), // lock plate
  r(0x3a2412, -1, -17, 2, 2), // keyhole
];

/** Deposit chest: dark wood, dark iron bands with rivets, a coin slot in the lid, no lock. */
const DEPOSIT_CHEST: ObjectRect[] = [
  r(0x3b2412, -12, -18, 24, 16), // body (darker than the bank chest)
  r(0x4d311a, -12, -CHEST_TOP, 24, 6), // lid
  r(0x24150a, -12, -17, 24, 1), // lid seam
  r(0x4a5058, -11, -22, 4, 20),
  r(0x4a5058, 7, -22, 4, 20), // dark iron bands
  r(0x9aa0a8, -10, -20, 1, 1),
  r(0x9aa0a8, 9, -20, 1, 1),
  r(0x9aa0a8, -10, -5, 1, 1),
  r(0x9aa0a8, 9, -5, 1, 1), // rivets
  r(0xe0b84a, -5, -CHEST_TOP + 1, 10, 4), // gold coin plate on the lid
  r(0x120a04, -3, -CHEST_TOP + 2, 6, 1), // the coin slot
  r(0xe0b84a, -1, -12, 2, 2), // coin emblem on the front
];

const BANK_BOOTH: ObjectRect[] = [
  r(0x6e4220, -BOOTH_HALF_W, -BOOTH_COUNTER_TOP + 4, BOOTH_HALF_W * 2, 14), // front
  r(0x8a5a2b, -BOOTH_HALF_W, -BOOTH_COUNTER_TOP, BOOTH_HALF_W * 2, 5), // counter top
  r(0x4a2b12, -12, -11, 24, 1),
  r(0x4a2b12, -12, -5, 24, 1), // panel seams
  r(0x3a2412, -BOOTH_HALF_W, -BOOTH_SIGN_TOP + 4, 3, 10), // sign posts
  r(0x3a2412, BOOTH_HALF_W - 3, -BOOTH_SIGN_TOP + 4, 3, 10),
  r(0xe0b84a, -10, -BOOTH_SIGN_TOP, 20, 7), // gold sign
  r(0x8a6a1a, -10, -BOOTH_SIGN_TOP + 6, 20, 1), // sign shade
  r(0x3a2412, -1, -BOOTH_SIGN_TOP + 2, 2, 3), // sign mark
];

export const OBJECT_ART = {
  bank_chest: { halfW: CHEST_HALF_W, rects: BANK_CHEST },
  deposit_chest: { halfW: CHEST_HALF_W, rects: DEPOSIT_CHEST },
  bank_booth: { halfW: BOOTH_HALF_W, rects: BANK_BOOTH },
} as const;
