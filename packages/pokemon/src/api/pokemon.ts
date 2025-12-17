const BASE_URL = "https://pokeapi.co/api/v2";

export interface PokemonListItem {
  name: string;
  url: string;
}

export interface PokemonListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PokemonListItem[];
}

export interface PokemonType {
  slot: number;
  type: {
    name: string;
    url: string;
  };
}

export interface PokemonStat {
  base_stat: number;
  effort: number;
  stat: {
    name: string;
    url: string;
  };
}

export interface PokemonAbility {
  ability: {
    name: string;
    url: string;
  };
  is_hidden: boolean;
  slot: number;
}

export interface PokemonSprites {
  front_default: string | null;
  front_shiny: string | null;
  back_default: string | null;
  back_shiny: string | null;
  other?: {
    "official-artwork"?: {
      front_default: string | null;
      front_shiny: string | null;
    };
    dream_world?: {
      front_default: string | null;
    };
  };
}

export interface Pokemon {
  id: number;
  name: string;
  height: number;
  weight: number;
  base_experience: number;
  types: PokemonType[];
  stats: PokemonStat[];
  abilities: PokemonAbility[];
  sprites: PokemonSprites;
}

export interface PokemonSpecies {
  id: number;
  name: string;
  flavor_text_entries: {
    flavor_text: string;
    language: { name: string };
    version: { name: string };
  }[];
  genera: {
    genus: string;
    language: { name: string };
  }[];
  evolution_chain: {
    url: string;
  };
  color: {
    name: string;
  };
  habitat: {
    name: string;
  } | null;
}

export interface EvolutionChain {
  id: number;
  chain: EvolutionNode;
}

export interface EvolutionNode {
  species: {
    name: string;
    url: string;
  };
  evolves_to: EvolutionNode[];
  evolution_details: {
    min_level: number | null;
    trigger: { name: string };
    item: { name: string } | null;
  }[];
}

// API functions
export async function fetchPokemonList(
  offset = 0,
  limit = 20,
  signal?: AbortSignal
): Promise<PokemonListResponse> {
  const response = await fetch(
    `${BASE_URL}/pokemon?offset=${offset}&limit=${limit}`,
    { signal }
  );
  if (!response.ok) throw new Error("Failed to fetch Pokemon list");
  return response.json();
}

export async function fetchPokemon(
  idOrName: number | string,
  signal?: AbortSignal
): Promise<Pokemon> {
  const response = await fetch(`${BASE_URL}/pokemon/${idOrName}`, { signal });
  if (!response.ok) throw new Error(`Failed to fetch Pokemon: ${idOrName}`);
  return response.json();
}

export async function fetchPokemonSpecies(
  idOrName: number | string,
  signal?: AbortSignal
): Promise<PokemonSpecies> {
  const response = await fetch(`${BASE_URL}/pokemon-species/${idOrName}`, {
    signal,
  });
  if (!response.ok)
    throw new Error(`Failed to fetch Pokemon species: ${idOrName}`);
  return response.json();
}

export async function fetchEvolutionChain(
  url: string,
  signal?: AbortSignal
): Promise<EvolutionChain> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Failed to fetch evolution chain");
  return response.json();
}

export async function searchPokemon(
  query: string,
  signal?: AbortSignal
): Promise<Pokemon | null> {
  try {
    const response = await fetch(
      `${BASE_URL}/pokemon/${query.toLowerCase()}`,
      { signal }
    );
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

// Helper to get Pokemon ID from URL
export function getIdFromUrl(url: string): number {
  const parts = url.split("/").filter(Boolean);
  return parseInt(parts[parts.length - 1], 10);
}

// Helper to format Pokemon name
export function formatPokemonName(name: string): string {
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Helper to get artwork URL
export function getArtworkUrl(pokemon: Pokemon): string {
  return (
    pokemon.sprites.other?.["official-artwork"]?.front_default ||
    pokemon.sprites.other?.dream_world?.front_default ||
    pokemon.sprites.front_default ||
    ""
  );
}

