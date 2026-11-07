import { invoke } from "@tauri-apps/api/core";

export type Note = {
  matchId: string;
  note: string;
  tags: string[];
  updatedAt: string;
};

export type NoteEntry = {
  matchId: string;
  startedAt: string;
  mapName: string | null;
  agentId: string | null;
  agentName: string | null;
  won: boolean;
  roundsWon: number;
  roundsLost: number;
  kills: number;
  deaths: number;
  assists: number;
  acs: number;
  score: number | null;
  note: string;
  tags: string[];
  updatedAt: string;
};

export type TagStat = {
  tag: string;
  matches: number;
  wins: number;
  winRate: number;
  avgAcs: number;
  avgScore: number | null;
  withoutMatches: number;
  withoutWinRate: number;
  withoutAcs: number;
};

export const SUGGESTED_TAGS = ["Fatigué", "En duo", "En stack", "Nouvelle sensi", "Nouveau setup", "Tilt", "Échauffé", "Soirée"];

export const journal = {
  getNote: (puuid: string, matchId: string) => invoke<Note | null>("get_note", { puuid, matchId }),
  saveNote: (puuid: string, matchId: string, note: string, tags: string[]) =>
    invoke<void>("save_note", { puuid, matchId, note, tags }),
  listNotes: (puuid: string) => invoke<NoteEntry[]>("list_notes", { puuid }),
  listTags: (puuid: string) => invoke<TagStat[]>("list_tags", { puuid }),
};

export function sameTag(a: string, b: string): boolean {
  return a.toLocaleLowerCase("fr-FR") === b.toLocaleLowerCase("fr-FR");
}

export function firstLine(note: string): string {
  return note.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
}
