import { useSyncExternalStore } from "react";
import { lang } from "./i18n";

const MEDIA = "https://media.valorant-api.com";
const AGENTS_URL = "https://valorant-api.com/v1/agents?isPlayableCharacter=true";
const STORAGE_KEY = "valtracker.agent-catalog.v1";
const STALE_AFTER_MS = 3 * 24 * 3600 * 1000;

export type WeaponArt = "displayicon" | "killstreamicon";
export type AgentArt = "displayicon" | "fullportrait" | "bustportrait" | "background" | "killfeedportrait";
export type MapArt = "splash" | "listviewicon" | "listviewicontall" | "displayicon" | "stylizedbackgroundimage";
export type CardArt = "smallart" | "wideart" | "largeart";

export const MELEE_ID = "2f59173c-4bed-b6c3-2191-dea9b58be9c7";

export function weaponArt(id: string | null | undefined, art: WeaponArt = "displayicon"): string | undefined {
  return id ? `${MEDIA}/weapons/${id}/${art}.png` : undefined;
}

export function agentArt(id: string | null | undefined, art: AgentArt = "displayicon"): string | undefined {
  return id ? `${MEDIA}/agents/${id.toLowerCase()}/${art}.png` : undefined;
}

export function mapArt(id: string | null | undefined, art: MapArt = "splash"): string | undefined {
  return id ? `${MEDIA}/maps/${id}/${art}.png` : undefined;
}

export function cardArt(id: string | null | undefined, art: CardArt = "smallart"): string | undefined {
  return id ? `${MEDIA}/playercards/${id}/${art}.png` : undefined;
}

export type Ability = {
  agentId: string;
  slot: string;
  name: string;
  label: string;
  icon: string | null;
};

export type AgentInfo = {
  id: string;
  name: string;
  role: string | null;
  roleIcon: string | null;
  colors: string[];
  rightFacing: boolean;
  abilities: Ability[];
};

export type Catalog = {
  agents: Map<string, AgentInfo>;
  abilities: Map<string, Ability[]>;
};

type Stored = { savedAt: number; agents: AgentInfo[] };

type RawAbility = { slot?: string; displayName?: string; displayIcon?: string | null };
type RawAgent = {
  uuid?: string;
  displayName?: string;
  role?: { displayName?: string; displayIcon?: string | null } | null;
  backgroundGradientColors?: string[] | null;
  isFullPortraitRightFacing?: boolean;
  abilities?: RawAbility[] | null;
};

const SLOT_ORDER = ["Grenade", "Ability1", "Ability2", "Ultimate", "Passive"];

let catalog: Catalog | null = null;
let catalogLanguage = "";
let savedAt = 0;
let loading: Promise<void> | null = null;
let loadingLanguage = "";
const listeners = new Set<() => void>();

function build(agents: AgentInfo[]): Catalog {
  const abilities = new Map<string, Ability[]>();
  for (const agent of agents) {
    for (const ability of agent.abilities) {
      const key = ability.name.trim().toLowerCase();
      abilities.set(key, [...(abilities.get(key) ?? []), ability]);
    }
  }
  return { agents: new Map(agents.map((agent) => [agent.id, agent])), abilities };
}

function apiLanguage(): string {
  return lang() === "en" ? "en-US" : "fr-FR";
}

function storageKey(language: string): string {
  return language === "fr-FR" ? STORAGE_KEY : `${STORAGE_KEY}.${language}`;
}

function restore(language: string) {
  catalog = null;
  savedAt = 0;
  catalogLanguage = language;
  try {
    const raw = localStorage.getItem(storageKey(language));
    if (!raw) return;
    const stored = JSON.parse(raw) as Stored;
    if (!Array.isArray(stored.agents)) return;
    catalog = build(stored.agents);
    savedAt = stored.savedAt ?? 0;
  } catch {
    catalog = null;
  }
}

function current(): Catalog | null {
  const language = apiLanguage();
  if (language !== catalogLanguage) restore(language);
  return catalog;
}

function persist(language: string, agents: AgentInfo[]) {
  try {
    localStorage.setItem(storageKey(language), JSON.stringify({ savedAt: Date.now(), agents } satisfies Stored));
  } catch {
    return;
  }
}

async function fetchAgents(language: string): Promise<RawAgent[]> {
  const response = await fetch(`${AGENTS_URL}&language=${language}`);
  if (!response.ok) throw new Error(String(response.status));
  const body = (await response.json()) as { data?: RawAgent[] };
  return body.data ?? [];
}

function merge(english: RawAgent[], french: RawAgent[]): AgentInfo[] {
  const local = new Map(french.map((agent) => [agent.uuid, agent]));
  return english
    .filter((agent) => agent.uuid && agent.displayName)
    .map((agent) => {
      const id = agent.uuid!.toLowerCase();
      const translated = local.get(agent.uuid);
      const labels = new Map((translated?.abilities ?? []).map((ability) => [ability.slot, ability.displayName]));
      const abilities = (agent.abilities ?? [])
        .filter((ability) => ability.slot && ability.displayName)
        .map((ability) => ({
          agentId: id,
          slot: ability.slot!,
          name: ability.displayName!,
          label: labels.get(ability.slot) ?? ability.displayName!,
          icon: ability.displayIcon ?? null,
        }))
        .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
      return {
        id,
        name: translated?.displayName ?? agent.displayName!,
        role: agent.role?.displayName ?? null,
        roleIcon: agent.role?.displayIcon ?? null,
        colors: (agent.backgroundGradientColors ?? []).filter((color) => /^[0-9a-f]{6,8}$/i.test(color)),
        rightFacing: agent.isFullPortraitRightFacing ?? false,
        abilities,
      };
    });
}

function load() {
  const language = apiLanguage();
  if (loading && loadingLanguage === language) return;
  if (current() && Date.now() - savedAt < STALE_AFTER_MS) return;
  const english = fetchAgents("en-US");
  const localized = language === "en-US" ? english : fetchAgents(language);
  loadingLanguage = language;
  const request: Promise<void> = Promise.all([english, localized])
    .then(([source, translated]) => {
      const agents = merge(source, translated);
      if (agents.length === 0) return;
      persist(language, agents);
      if (apiLanguage() !== language) return;
      catalog = build(agents);
      catalogLanguage = language;
      savedAt = Date.now();
      listeners.forEach((listener) => listener());
    })
    .catch(() => undefined)
    .finally(() => {
      if (loading === request) loading = null;
    });
  loading = request;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  load();
  return () => {
    listeners.delete(listener);
  };
}

restore(apiLanguage());

export function useAgentCatalog(): Catalog | null {
  return useSyncExternalStore(subscribe, current);
}

export function findAbility(source: Catalog | null, name: string | null | undefined, agentId?: string | null): Ability | null {
  if (!source || !name) return null;
  const matches = source.abilities.get(name.trim().toLowerCase());
  if (!matches?.length) return null;
  const agent = agentId?.toLowerCase();
  return matches.find((ability) => ability.agentId === agent) ?? matches[0];
}

export function agentColor(info: AgentInfo | null | undefined, index = 0): string | null {
  const color = info?.colors[index];
  return color ? `#${color.slice(0, 6)}` : null;
}
