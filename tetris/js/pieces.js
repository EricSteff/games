/**
 * Nintendo Rotation System — left-handed (Game Boy Tetris, 1989)
 * No wall kicks. Rotate counter-clockwise through states 0→1→2→3.
 * Playfield: 10 × 18
 */

export const COLS = 10;
export const ROWS = 18;

export const TYPES = ["I", "O", "T", "S", "Z", "J", "L"];

/**
 * Offsets [row, col] relative to pivot.
 * Left-handed: S/Z vertical orientations favor the left (vs NES right-handed).
 */
export const SHAPES = {
  // Horizontal I one cell lower than ORS (NES/GB style lower half)
  I: [
    [
      [1, -1],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
    [
      [-1, 1],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  ],
  O: [
    [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ],
  ],
  T: [
    [
      [0, -1],
      [0, 0],
      [0, 1],
      [1, 0],
    ],
    [
      [-1, 0],
      [0, 0],
      [1, 0],
      [0, -1],
    ],
    [
      [0, -1],
      [0, 0],
      [0, 1],
      [-1, 0],
    ],
    [
      [-1, 0],
      [0, 0],
      [1, 0],
      [0, 1],
    ],
  ],
  // Left-handed S
  S: [
    [
      [0, 0],
      [0, 1],
      [1, -1],
      [1, 0],
    ],
    [
      [-1, 0],
      [0, 0],
      [0, -1],
      [1, -1],
    ],
  ],
  // Left-handed Z
  Z: [
    [
      [0, -1],
      [0, 0],
      [1, 0],
      [1, 1],
    ],
    [
      [-1, 0],
      [0, 0],
      [0, 1],
      [1, 1],
    ],
  ],
  J: [
    [
      [0, -1],
      [0, 0],
      [0, 1],
      [1, 1],
    ],
    [
      [-1, 0],
      [0, 0],
      [1, 0],
      [1, -1],
    ],
    [
      [-1, -1],
      [0, -1],
      [0, 0],
      [0, 1],
    ],
    [
      [-1, 0],
      [-1, 1],
      [0, 0],
      [1, 0],
    ],
  ],
  L: [
    [
      [0, -1],
      [0, 0],
      [0, 1],
      [1, -1],
    ],
    [
      [-1, 0],
      [-1, -1],
      [0, 0],
      [1, 0],
    ],
    [
      [-1, 1],
      [0, -1],
      [0, 0],
      [0, 1],
    ],
    [
      [-1, 0],
      [0, 0],
      [1, 0],
      [1, 1],
    ],
  ],
};

/** Spawn: highest block near top; pivot ~ column 4 */
export function spawnPos(type) {
  if (type === "I") return { row: -1, col: 3 };
  if (type === "O") return { row: 0, col: 4 };
  return { row: 0, col: 4 };
}

export function getCells(type, rot, row, col) {
  const states = SHAPES[type];
  const shape = states[rot % states.length];
  return shape.map(([dr, dc]) => ({ row: row + dr, col: col + dc }));
}

/**
 * Game Boy-style randomizer approximation:
 * roll a piece; if it matches the previous piece, re-roll once.
 */
export function nextRandom(prev) {
  let t = TYPES[(Math.random() * 7) | 0];
  if (t === prev) t = TYPES[(Math.random() * 7) | 0];
  return t;
}
