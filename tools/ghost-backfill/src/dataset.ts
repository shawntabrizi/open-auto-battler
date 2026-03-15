export interface DatasetUnit {
  card_ref: number;
  perm_attack: number;
  perm_health: number;
}

export interface DatasetBoard {
  name: string;
  units: DatasetUnit[];
}

export interface DatasetBracket {
  round: number;
  wins: number;
  losses: number;
  boards: DatasetBoard[];
}

export interface DatasetSet {
  set_id: number;
  description?: string;
  brackets: DatasetBracket[];
}

export interface GhostBackfillDataset {
  version: number;
  starting_lives: number;
  max_round: number;
  sets: DatasetSet[];
}
