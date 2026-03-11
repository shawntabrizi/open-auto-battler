import { writeFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DatasetBoard,
  DatasetBracket,
  GhostBackfillDataset,
} from "./dataset.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(PROJECT_ROOT, "ghost-board-backfill.json");

const STARTING_LIVES = 3;
const MAX_ROUND = 10;
const TARGET_SET_ID = 0;

const BOARD_VARIANTS = [
  { name: "tempo", sizeBias: 0, attackBias: 1, healthBias: 0 },
  {
    name: "balanced",
    sizeBias: 1,
    attackBias: 0,
    healthBias: 1,
  },
  { name: "tank", sizeBias: 2, attackBias: -1, healthBias: 2 },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildUnitCount(
  round: number,
  wins: number,
  losses: number,
  variant: (typeof BOARD_VARIANTS)[number],
): number {
  const base = 1 + Math.floor((round - 1) / 2);
  const winPressure = wins >= 6 ? 1 : 0;
  const lossPenalty = losses === 2 ? 1 : 0;
  return clamp(base + variant.sizeBias + winPressure - lossPenalty, 1, 5);
}

function buildBoard(
  round: number,
  wins: number,
  losses: number,
  variant: (typeof BOARD_VARIANTS)[number],
): DatasetBoard {
  const unitCount = buildUnitCount(round, wins, losses, variant);

  return {
    name: variant.name,
    units: Array.from({ length: unitCount }, (_, slot) => {
      const seed =
        round * 97 +
        wins * 31 +
        losses * 17 +
        variant.sizeBias * 13 +
        variant.attackBias * 19 +
        slot * 7;
      const attackBase =
        Math.floor((wins + slot + round) / 3) + variant.attackBias - losses;
      const healthBase =
        Math.floor((round + slot) / 2) +
        variant.healthBias +
        Math.max(0, 1 - losses);

      return {
        card_ref: Math.abs(seed) % 12,
        perm_attack: clamp(attackBase, 0, 8),
        perm_health: clamp(healthBase, 0, 10),
      };
    }),
  };
}

function buildBracket(
  round: number,
  wins: number,
  losses: number,
): DatasetBracket {
  return {
    round,
    wins,
    losses,
    boards: BOARD_VARIANTS.map((variant) =>
      buildBoard(round, wins, losses, variant),
    ),
  };
}

function buildBrackets(): DatasetBracket[] {
  const brackets: DatasetBracket[] = [];

  for (let round = 1; round <= MAX_ROUND; round += 1) {
    for (let wins = 0; wins <= 9; wins += 1) {
      for (let losses = 0; losses <= 2; losses += 1) {
        if (wins + losses > round - 1) continue;
        brackets.push(buildBracket(round, wins, losses));
      }
    }
  }

  return brackets;
}

const dataset: GhostBackfillDataset = {
  version: 1,
  starting_lives: STARTING_LIVES,
  max_round: MAX_ROUND,
  sets: [
    {
      set_id: TARGET_SET_ID,
      description:
        "Three deterministic ghost board presets for every non-terminal round / wins / losses bracket through round 10.",
      brackets: buildBrackets(),
    },
  ],
};

await writeFile(OUTPUT_PATH, `${JSON.stringify(dataset, null, 2)}\n`);

const bracketCount = dataset.sets[0].brackets.length;
const boardCount = dataset.sets[0].brackets.reduce(
  (count, bracket) => count + bracket.boards.length,
  0,
);

console.log(
  `Wrote ${OUTPUT_PATH} with ${bracketCount} brackets and ${boardCount} boards for set ${TARGET_SET_ID}.`,
);
