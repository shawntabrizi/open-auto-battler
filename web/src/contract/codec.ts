/**
 * SCALE decoders for the arena's ranked-play and badge views.
 *
 * The contract returns these as SCALE inside ABI `bytes` (see
 * `contract/src/main.rs`: `LeaderboardEntry`, `BadgeRecord`, `BadgeConfig`).
 * The fixtures in `./fixtures/scale.txt` are checked against the Rust types by
 * a contract test (`frontend_scale_fixtures`) and against these decoders by
 * `codec.test.ts`, so a change on one side fails a test on the other.
 *
 * Plain TypeScript with no imports: `scripts/check-ranked-reads.mjs` imports
 * this file directly (Node type stripping) to decode live contract output.
 */

export type Hex = `0x${string}`;

/** `LeaderboardEntry { alias: [u8; 32], set_id: u16, wins: u8, lives: u8, rounds: u8, block: u64 }` */
export interface LeaderboardEntry {
  alias: Hex;
  setId: number;
  wins: number;
  lives: number;
  rounds: number;
  block: bigint;
}

/** `BadgeRecord { badge: u8, set_id: u16, block: u64, token: Option<u64> }`; `token: null` = pending. */
export interface BadgeRecord {
  badge: number;
  setId: number;
  block: bigint;
  token: bigint | null;
}

/** `BadgeConfig { collection: u32, items: Vec<u32> }` */
export interface BadgeConfig {
  collection: number;
  items: number[];
}

export const BADGE_VICTORY = 0;
export const BADGE_FLAWLESS = 1;

export function badgeName(badge: number): string {
  if (badge === BADGE_VICTORY) return 'Victory';
  if (badge === BADGE_FLAWLESS) return 'Flawless';
  return `Badge #${badge}`;
}

export const ZERO_ALIAS: Hex = `0x${'00'.repeat(32)}`;

export function isZeroAlias(alias: string): boolean {
  return /^0x0*$/i.test(alias);
}

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || /[^0-9a-f]/i.test(h)) throw new Error(`Invalid hex: ${hex}`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): Hex {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `0x${hex}`;
}

/** Sequential little-endian SCALE reader. Every read is bounds-checked. */
class Reader {
  private offset = 0;
  private readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  private take(n: number): Uint8Array {
    if (this.offset + n > this.bytes.length) {
      throw new Error(
        `SCALE: need ${n} bytes at offset ${this.offset}, have ${this.bytes.length - this.offset}`
      );
    }
    const out = this.bytes.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }

  private uint(n: number): bigint {
    const b = this.take(n);
    let v = 0n;
    for (let i = n - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i] ?? 0);
    return v;
  }

  u8 = () => Number(this.uint(1));
  u16 = () => Number(this.uint(2));
  u32 = () => Number(this.uint(4));
  u64 = () => this.uint(8);

  /** SCALE compact length, as a JS number (vectors here are small). */
  compact(): number {
    const first = this.bytes[this.offset];
    if (first === undefined) throw new Error('SCALE: missing compact prefix');
    const mode = first & 0b11;
    let v: bigint;
    if (mode === 0) v = this.uint(1) >> 2n;
    else if (mode === 1) v = this.uint(2) >> 2n;
    else if (mode === 2) v = this.uint(4) >> 2n;
    else {
      this.take(1);
      v = this.uint((first >> 2) + 4);
    }
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('SCALE: compact too large');
    return Number(v);
  }

  fixed(n: number): Uint8Array {
    return this.take(n);
  }

  vec<T>(item: () => T): T[] {
    const len = this.compact();
    // Each item is at least one byte: a length beyond the input is corrupt.
    if (len > this.bytes.length - this.offset) throw new Error(`SCALE: vec length ${len} too big`);
    const out: T[] = [];
    for (let i = 0; i < len; i++) out.push(item());
    return out;
  }

  option<T>(item: () => T): T | null {
    const tag = this.u8();
    if (tag === 0) return null;
    if (tag === 1) return item();
    throw new Error(`SCALE: bad Option tag ${tag}`);
  }

  /** Throw if bytes are left: a length mismatch means the layout is wrong. */
  end(): void {
    if (this.offset !== this.bytes.length) {
      throw new Error(`SCALE: ${this.bytes.length - this.offset} trailing bytes`);
    }
  }
}

function readEntry(r: Reader): LeaderboardEntry {
  return {
    alias: bytesToHex(r.fixed(32)),
    setId: r.u16(),
    wins: r.u8(),
    lives: r.u8(),
    rounds: r.u8(),
    block: r.u64(),
  };
}

function toBytes(input: Uint8Array | string): Uint8Array {
  return typeof input === 'string' ? hexToBytes(input) : input;
}

/** `getLeaderboard` output: SCALE `Vec<LeaderboardEntry>`, best first. */
export function decodeLeaderboard(input: Uint8Array | string): LeaderboardEntry[] {
  const r = new Reader(toBytes(input));
  const out = r.vec(() => readEntry(r));
  r.end();
  return out;
}

/** `getBestRun` output: one SCALE `LeaderboardEntry`, or empty bytes for none. */
export function decodeBestRun(input: Uint8Array | string): LeaderboardEntry | null {
  const bytes = toBytes(input);
  if (bytes.length === 0) return null;
  const r = new Reader(bytes);
  const out = readEntry(r);
  r.end();
  return out;
}

/** `getBadges` output: SCALE `Vec<BadgeRecord>` in the order earned. */
export function decodeBadges(input: Uint8Array | string): BadgeRecord[] {
  const r = new Reader(toBytes(input));
  const out = r.vec(() => ({
    badge: r.u8(),
    setId: r.u16(),
    block: r.u64(),
    token: r.option(() => r.u64()),
  }));
  r.end();
  return out;
}

/** `getBadgeConfig` output: SCALE `BadgeConfig`, or empty bytes before `initAchievements`. */
export function decodeBadgeConfig(input: Uint8Array | string): BadgeConfig | null {
  const bytes = toBytes(input);
  if (bytes.length === 0) return null;
  const r = new Reader(bytes);
  const out = { collection: r.u32(), items: r.vec(() => r.u32()) };
  r.end();
  return out;
}

// ── Badge events ─────────────────────────────────────────────────────────────
//
// `BadgeMinted(address indexed player, uint8 badge, uint16 setId, uint256 tokenId)`
// `BadgePending(address indexed player, uint8 badge, uint16 setId)`
// Standard Solidity ABI data words (contract `emit_badge_event`).

export const BADGE_MINTED_TOPIC =
  '0xbd1356c5aeb02333826f94682d66bd82dc7ebfc1404228d119f6ebdf616b7db7';
export const BADGE_PENDING_TOPIC =
  '0xd39403252e3d7eb99af74acb5b83b012f0be64b87d359fdddd26797ea8353256';

export interface BadgeEvent {
  kind: 'minted' | 'pending';
  /** Lower-case H160 of the player (topic 1). */
  player: Hex;
  badge: number;
  setId: number;
  token: bigint | null;
}

function word(data: Uint8Array, i: number): bigint {
  let v = 0n;
  for (let k = i * 32; k < i * 32 + 32; k++) v = (v << 8n) | BigInt(data[k] ?? 0);
  return v;
}

/** Decode one contract event as a badge event; null if it is another event. */
export function decodeBadgeEvent(topics: string[], data: Uint8Array): BadgeEvent | null {
  const topic0 = topics[0]?.toLowerCase();
  const kind =
    topic0 === BADGE_MINTED_TOPIC ? 'minted' : topic0 === BADGE_PENDING_TOPIC ? 'pending' : null;
  if (!kind || !topics[1]) return null;
  const words = kind === 'minted' ? 3 : 2;
  if (data.length < words * 32) return null;
  return {
    kind,
    player: `0x${topics[1].toLowerCase().slice(-40)}`,
    badge: Number(word(data, 0)),
    setId: Number(word(data, 1)),
    token: kind === 'minted' ? word(data, 2) : null,
  };
}

/** Short display form of a 32-byte personhood alias. */
export function shortAlias(alias: string): string {
  return `${alias.slice(0, 8)}…${alias.slice(-6)}`;
}

// ── Casual arena (`@oab/arena` v3+, CDM version 4) ──────────────────────────
//
// `getGame(player)` returns SCALE `ModeGame` and `BattleReported` carries
// SCALE `BattleReport` (crate `oab-protocol`). The WASM engine decodes both in
// full for play and replay; these decoders read the fields the app and the
// tests need. Fixtures: `./fixtures/arena.txt`, captured from the live arena by
// `scripts/m5/capture-fixtures.mjs`.

/** `GamePhase` variant index. */
export type GamePhaseName = 'shop' | 'battle' | 'completed';
const PHASES: GamePhaseName[] = ['shop', 'battle', 'completed'];

/** `BattleResult` variant index (`oab_battle::battle::BattleResult`). */
export type BattleResultName = 'Victory' | 'Defeat' | 'Draw';
const RESULTS: BattleResultName[] = ['Victory', 'Defeat', 'Draw'];

export interface GhostUnit {
  cardId: number;
  permAttack: number;
  permHealth: number;
}

/** The parts of SCALE `ModeGame` the app reads outside the engine. */
export interface ModeGameInfo {
  runId: bigint;
  engineVersion: number;
  setId: number;
  setHash: Hex;
  boardSize: number;
  round: number;
  lives: number;
  wins: number;
  phase: GamePhaseName;
}

function i16(r: Reader): number {
  const v = r.u16();
  return v >= 0x8000 ? v - 0x10000 : v;
}

/** SCALE `ModeGame` (oab-protocol). Empty bytes mean no game: returns null. */
export function decodeModeGame(input: Uint8Array | string): ModeGameInfo | null {
  const bytes = toBytes(input);
  if (bytes.length === 0) return null;
  const r = new Reader(bytes);
  const runId = r.u64();
  const engineVersion = r.u32();
  const setId = r.u16();
  const setHash = bytesToHex(r.fixed(32));
  // GameConfig: starting_lives, wins_to_victory, starting_mana_limit,
  // max_mana_limit, full_mana_each_round, board_size, hand_size, bag_size.
  const config = r.fixed(8);
  r.vec(() => r.u16()); // bag
  r.vec(() => r.u16()); // hand
  r.vec(() => r.option(() => [r.u16(), i16(r), i16(r)])); // board
  r.u8(); // mana_limit
  r.u8(); // shop_mana
  const round = r.u8();
  const lives = r.u8();
  const wins = r.u8();
  const phaseIndex = r.u8();
  const phase = PHASES[phaseIndex];
  if (!phase) throw new Error(`SCALE: bad GamePhase ${phaseIndex}`);
  r.u16(); // next_card_id
  r.u64(); // game_seed
  r.option(() => r.fixed(32)); // alias
  r.u64(); // started_block
  r.end();
  return {
    runId,
    engineVersion,
    setId,
    setHash,
    boardSize: config[5] ?? 0,
    round,
    lives,
    wins,
    phase,
  };
}

/** SCALE `BattleReport` (oab-protocol), the payload of `BattleReported`. */
export interface BattleReportInfo {
  engineVersion: number;
  setId: number;
  round: number;
  result: BattleResultName;
  /** Wins and lives after the battle. */
  wins: number;
  lives: number;
  battleSeed: bigint;
  playerBoard: GhostUnit[];
  opponent: GhostUnit[];
}

export function decodeBattleReport(input: Uint8Array | string): BattleReportInfo {
  const r = new Reader(toBytes(input));
  const ghost = () => r.vec(() => ({ cardId: r.u16(), permAttack: i16(r), permHealth: i16(r) }));
  const engineVersion = r.u32();
  const setId = r.u16();
  const round = r.u8();
  const resultIndex = r.u8();
  const result = RESULTS[resultIndex];
  if (!result) throw new Error(`SCALE: bad BattleResult ${resultIndex}`);
  const out = {
    engineVersion,
    setId,
    round,
    result,
    wins: r.u8(),
    lives: r.u8(),
    battleSeed: r.u64(),
    playerBoard: ghost(),
    opponent: ghost(),
  };
  r.end();
  return out;
}

/** keccak256("BattleReported(address,uint64,bytes)") */
export const BATTLE_REPORTED_TOPIC =
  '0x9f7cba67d0eab61749c52e5ed5100fc5f20adb06deabcab72493fcdd99e80b29';

/**
 * `BattleReported(address indexed player, uint64 indexed runId, bytes report)`:
 * the SCALE report inside the ABI `bytes` data, or null if this is another
 * event or another player's.
 */
export function decodeBattleReportedEvent(
  topics: string[],
  data: Uint8Array,
  player: string
): Uint8Array | null {
  if (topics[0]?.toLowerCase() !== BATTLE_REPORTED_TOPIC) return null;
  if (!topics[1] || topics[1].toLowerCase().slice(-40) !== player.toLowerCase().slice(-40)) {
    return null;
  }
  const offset = Number(word(data, 0));
  if (offset % 32 !== 0 || data.length < offset + 32) throw new Error('BattleReported: bad offset');
  const len = Number(word(data, offset / 32));
  const start = offset + 32;
  if (data.length < start + len) throw new Error('BattleReported: short data');
  return data.slice(start, start + len);
}
