import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AccountId,
  createClient,
  type PolkadotSigner,
} from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { getPolkadotSigner } from "polkadot-api/signer";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import {
  DEV_PHRASE,
  entropyToMiniSecret,
  mnemonicToEntropy,
} from "@polkadot-labs/hdkd-helpers";
import { auto_battle } from "@polkadot-api/descriptors";
import type {
  DatasetBoard,
  DatasetSet,
  GhostBackfillDataset,
} from "./dataset.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const DEFAULT_WS = "ws://127.0.0.1:9944";
const DEFAULT_CONFIG = path.join(PROJECT_ROOT, "ghost-board-backfill.json");

interface CliOptions {
  ws: string;
  config: string;
  setId: number;
  account: string;
  mnemonic: string;
  dryRun: boolean;
  batchSize: number;
  limit?: number;
}

interface WorkItem {
  set_id: number;
  round: number;
  wins: number;
  losses: number;
  board: DatasetBoard;
}

interface PreparedWorkItem extends WorkItem {
  lives: number;
  label: string;
  resolvedBoard: ReturnType<typeof resolveBoardUnits>;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    ws: process.env.CHAIN_WS_URL || DEFAULT_WS,
    config: process.env.GHOST_BACKFILL_CONFIG || DEFAULT_CONFIG,
    setId:
      process.env.GHOST_BACKFILL_SET_ID === undefined
        ? 0
        : Number.parseInt(process.env.GHOST_BACKFILL_SET_ID, 10),
    account: process.env.GHOST_BACKFILL_ACCOUNT || "Alice",
    mnemonic: process.env.SUDO_MNEMONIC || DEV_PHRASE,
    dryRun: false,
    batchSize:
      process.env.GHOST_BACKFILL_BATCH_SIZE === undefined
        ? 10
        : Number.parseInt(process.env.GHOST_BACKFILL_BATCH_SIZE, 10),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--ws") {
      options.ws = argv[++index] ?? "";
      continue;
    }

    if (arg === "--config") {
      options.config = argv[++index] ?? "";
      continue;
    }

    if (arg === "--set-id") {
      options.setId = Number.parseInt(argv[++index] ?? "", 10);
      continue;
    }

    if (arg === "--account") {
      options.account = argv[++index] ?? "";
      continue;
    }

    if (arg === "--mnemonic") {
      options.mnemonic = argv[++index] ?? "";
      continue;
    }

    if (arg === "--limit") {
      options.limit = Number.parseInt(argv[++index] ?? "", 10);
      continue;
    }

    if (arg === "--batch-size") {
      options.batchSize = Number.parseInt(argv[++index] ?? "", 10);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.setId) || options.setId < 0) {
    throw new Error(`Invalid --set-id value: ${options.setId}`);
  }

  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) || options.limit <= 0)
  ) {
    throw new Error(`Invalid --limit value: ${options.limit}`);
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize <= 0) {
    throw new Error(`Invalid --batch-size value: ${options.batchSize}`);
  }

  if (!options.ws) {
    throw new Error("Missing --ws value.");
  }

  if (!options.config) {
    throw new Error("Missing --config value.");
  }

  if (!options.account) {
    throw new Error("Missing --account value.");
  }

  if (!options.mnemonic) {
    throw new Error("Missing --mnemonic value.");
  }

  return options;
}

function createDevSigner(accountName: string, mnemonic: string) {
  const miniSecret = entropyToMiniSecret(mnemonicToEntropy(mnemonic));
  const derive = sr25519CreateDerive(miniSecret);
  const keyPair = derive(`//${accountName}`);
  const address = AccountId(42).dec(keyPair.publicKey);

  return {
    address,
    signer: getPolkadotSigner(keyPair.publicKey, "Sr25519", keyPair.sign),
  };
}

function normalizeCardId(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && value !== null) {
    if ("value" in value && typeof value.value === "number") {
      return value.value;
    }

    if (Array.isArray(value) && typeof value[0] === "number") {
      return value[0];
    }
  }

  return Number(value);
}

function validateDataset(
  dataset: GhostBackfillDataset,
  targetSetId: number,
): DatasetSet {
  if (!Array.isArray(dataset.sets) || dataset.sets.length === 0) {
    throw new Error("Dataset is missing a non-empty sets array.");
  }

  const setEntry = dataset.sets.find((entry) => entry.set_id === targetSetId);
  if (!setEntry) {
    throw new Error(`Dataset does not contain set ${targetSetId}.`);
  }

  if (!Array.isArray(setEntry.brackets) || setEntry.brackets.length === 0) {
    throw new Error(
      `Dataset set ${targetSetId} does not contain any brackets.`,
    );
  }

  for (const bracket of setEntry.brackets) {
    if (!Array.isArray(bracket.boards) || bracket.boards.length < 3) {
      throw new Error(
        `Bracket round=${bracket.round} wins=${bracket.wins} losses=${bracket.losses} must contain at least 3 boards.`,
      );
    }
  }

  return setEntry;
}

function getOnChainSetCardIds(value: unknown): number[] {
  const entries = Array.isArray(value)
    ? value
    : typeof value === "object" &&
        value !== null &&
        "cards" in value &&
        Array.isArray(value.cards)
      ? value.cards
      : [];

  return entries.map((entry) =>
    typeof entry === "object" && entry !== null && "card_id" in entry
      ? normalizeCardId(entry.card_id)
      : normalizeCardId(entry),
  );
}

function resolveBoardUnits(board: DatasetBoard, setCardIds: number[]) {
  if (!Array.isArray(board.units) || board.units.length === 0) {
    throw new Error(`Board "${board.name}" does not contain any units.`);
  }

  return board.units.map((unit) => ({
    card_id: setCardIds[unit.card_ref % setCardIds.length],
    perm_attack: unit.perm_attack,
    perm_health: unit.perm_health,
  }));
}

function flattenWorkItems(setEntry: DatasetSet): WorkItem[] {
  const items: WorkItem[] = [];

  for (const bracket of setEntry.brackets) {
    for (const board of bracket.boards) {
      items.push({
        set_id: setEntry.set_id,
        round: bracket.round,
        wins: bracket.wins,
        losses: bracket.losses,
        board,
      });
    }
  }

  return items;
}

function prepareWorkItems(
  items: WorkItem[],
  setCardIds: number[],
  startingLives: number,
): PreparedWorkItem[] {
  return items.map((item, index) => {
    const lives = startingLives - item.losses;
    if (lives <= 0) {
      throw new Error(
        `Invalid lives computed for round=${item.round} wins=${item.wins} losses=${item.losses}.`,
      );
    }

    return {
      ...item,
      lives,
      resolvedBoard: resolveBoardUnits(item.board, setCardIds),
      label:
        `${index + 1}/${items.length} ` +
        `set=${item.set_id} round=${item.round} wins=${item.wins} losses=${item.losses} board=${item.board.name}`,
    };
  });
}

function chunkItems<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function formatDispatchError(dispatchError: unknown): string {
  if (!dispatchError) return "Unknown dispatch error";
  if (typeof dispatchError === "string") return dispatchError;

  if (typeof dispatchError === "object" && dispatchError !== null) {
    const maybeModule =
      "Module" in dispatchError ? dispatchError.Module : undefined;
    const maybeValue =
      "value" in dispatchError ? dispatchError.value : undefined;
    const mod =
      typeof maybeModule === "object" && maybeModule !== null
        ? maybeModule
        : typeof maybeValue === "object" && maybeValue !== null
          ? maybeValue
          : undefined;

    if (
      mod &&
      "index" in mod &&
      "error" in mod &&
      typeof mod.index === "number"
    ) {
      const errorValue = mod.error;
      const errorHex =
        typeof errorValue === "string"
          ? errorValue
          : `0x${Number(errorValue).toString(16).padStart(8, "0")}`;
      return `Module error (pallet ${mod.index}, error ${errorHex})`;
    }

    if ("type" in dispatchError) {
      const type = String(dispatchError.type);
      const value = "value" in dispatchError ? dispatchError.value : undefined;
      return `${type}: ${JSON.stringify(value)}`;
    }
  }

  return JSON.stringify(dispatchError);
}

async function submitTx(
  tx: {
    signAndSubmit: (signer: PolkadotSigner) => Promise<{
      events: Array<{ type: string; value?: { type?: string; value?: any } }>;
    }>;
  },
  signer: PolkadotSigner,
  label: string,
) {
  console.log(`[tx] submitting ${label}`);
  const result = await tx.signAndSubmit(signer);

  const failedEvent = result.events.find(
    (event) =>
      event.type === "System" && event.value?.type === "ExtrinsicFailed",
  );
  if (failedEvent) {
    const dispatchError =
      failedEvent.value?.value?.dispatch_error ?? failedEvent.value?.value;
    throw new Error(`${label}: ${formatDispatchError(dispatchError)}`);
  }

  return result.events;
}

function resolveUtilityBatch(api: any): {
  kind: "batch_all" | "batch";
  create: (calls: any[]) => any;
} {
  const utility = api?.tx?.Utility;

  if (!utility) {
    throw new Error(
      "Runtime metadata does not expose Utility. Restart the chain with the updated runtime and refresh the PAPI descriptors first.",
    );
  }

  if (typeof utility.batch_all === "function") {
    return {
      kind: "batch_all",
      create: (calls) => utility.batch_all({ calls }),
    };
  }

  if (typeof utility.batchAll === "function") {
    return {
      kind: "batch_all",
      create: (calls) => utility.batchAll({ calls }),
    };
  }

  if (typeof utility.batch === "function") {
    return {
      kind: "batch",
      create: (calls) => utility.batch({ calls }),
    };
  }

  throw new Error(
    "Utility pallet is present, but neither batch_all nor batch is available in the generated descriptors.",
  );
}

function extractBackfillEvents(
  events: Array<{ type: string; value?: { type?: string; value?: any } }>,
) {
  return events.filter(
    (event) =>
      event.type === "AutoBattle" &&
      event.value?.type === "GhostBoardBackfilled",
  );
}

function describeBatchFailure(
  events: Array<{ type: string; value?: { type?: string; value?: any } }>,
): string {
  const sudoEvent = events.find(
    (event) => event.type === "Sudo" && event.value?.type === "Sudid",
  );
  const utilityEvent = events.find((event) => event.type === "Utility");

  if (sudoEvent || utilityEvent) {
    return [sudoEvent, utilityEvent]
      .filter(Boolean)
      .map(
        (event) =>
          `${event?.type}.${event?.value?.type}: ${JSON.stringify(event?.value?.value)}`,
      )
      .join(" | ");
  }

  return "No Sudo/Utility failure details were emitted.";
}

function formatBatchLabel(
  batchIndex: number,
  batchCount: number,
  batch: PreparedWorkItem[],
) {
  const first = batch[0];
  const last = batch[batch.length - 1];

  return (
    `${batchIndex + 1}/${batchCount} ` +
    `size=${batch.length} ` +
    `items=${first.label.split(" ")[0]}..${last.label.split(" ")[0]}`
  );
}

function assertBatchSucceeded(
  events: Array<{ type: string; value?: { type?: string; value?: any } }>,
  batch: PreparedWorkItem[],
  label: string,
) {
  const backfillEvents = extractBackfillEvents(events);

  if (backfillEvents.length !== batch.length) {
    throw new Error(
      `${label}: expected ${batch.length} GhostBoardBackfilled events, got ${backfillEvents.length}. ${describeBatchFailure(events)}`,
    );
  }

  return backfillEvents.map((event) => event.value?.value);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const rawDataset = await readFile(options.config, "utf8");
  const dataset = JSON.parse(rawDataset) as GhostBackfillDataset;
  const setEntry = validateDataset(dataset, options.setId);
  const workItems = flattenWorkItems(setEntry);
  const limitedWorkItems =
    options.limit === undefined ? workItems : workItems.slice(0, options.limit);

  if (limitedWorkItems.length === 0) {
    throw new Error("No backfill work items were produced.");
  }

  const { address, signer } = createDevSigner(
    options.account,
    options.mnemonic,
  );
  const client = createClient(withPolkadotSdkCompat(getWsProvider(options.ws)));

  try {
    const api = client.getTypedApi(auto_battle);
    const sudoKey = await api.query.Sudo.Key.getValue();
    const onChainSet = await api.query.AutoBattle.CardSets.getValue(
      options.setId,
    );

    if (!onChainSet) {
      throw new Error(`On-chain set ${options.setId} does not exist.`);
    }

    const setCardIds = getOnChainSetCardIds(onChainSet);
    if (setCardIds.length === 0) {
      throw new Error(`On-chain set ${options.setId} has no cards.`);
    }

    const preparedWorkItems = prepareWorkItems(
      limitedWorkItems,
      setCardIds,
      dataset.starting_lives,
    );
    const batches = chunkItems(preparedWorkItems, options.batchSize);
    const utilityBatch = options.dryRun
      ? null
      : resolveUtilityBatch(api as any);

    console.log(
      `Connected to ${options.ws} as ${address} using //${options.account}. Sudo key: ${sudoKey ?? "none"}`,
    );
    console.log(
      `Preparing ${preparedWorkItems.length} backfills for set ${options.setId} with ${setCardIds.length} set cards in ${batches.length} batches of up to ${options.batchSize}${utilityBatch ? ` using Utility.${utilityBatch.kind}` : ""}.`,
    );

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];
      const batchLabel = formatBatchLabel(batchIndex, batches.length, batch);
      if (options.dryRun) {
        console.log(
          `[dry-run] batch ${batchLabel}`,
          batch.map((item) => item.label),
        );
        continue;
      }

      const innerCalls = batch.map(
        (item) =>
          api.tx.AutoBattle.backfill_ghost_board({
            set_id: item.set_id,
            round: item.round,
            wins: item.wins,
            lives: item.lives,
            board: item.resolvedBoard,
          }).decodedCall,
      );

      const batchedTx = utilityBatch!.create(innerCalls);
      const sudoTx = api.tx.Sudo.sudo({
        call: batchedTx.decodedCall,
      });

      const events = await submitTx(sudoTx, signer, `batch ${batchLabel}`);
      const results = assertBatchSucceeded(
        events,
        batch,
        `batch ${batchLabel}`,
      );

      console.log(
        `[tx] ok batch ${batchLabel} -> ${results.length} GhostBoardBackfilled events`,
      );
    }
  } finally {
    client.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
