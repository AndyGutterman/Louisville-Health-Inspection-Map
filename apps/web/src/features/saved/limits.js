// How much the Saved panel holds and shows.

// The database enforces the same limits (enforce_row_cap triggers).
const CAPS = { places: 30, areas: 3 };
// An area lists at most this many places: the ones with the most violations.
const ZONE_ROWS = 50;
const PAGE = 25;

export { CAPS, ZONE_ROWS, PAGE };
