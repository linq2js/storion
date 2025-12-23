import { store, type ActionsBase } from "storion";
import { async, type AsyncState } from "storion/async";
import type { Selector } from "storion/react";
import {
  fetchPokemonList,
  fetchPokemon,
  fetchPokemonSpecies,
  type Pokemon,
  type PokemonSpecies,
  type PokemonListItem,
  getIdFromUrl,
} from "../api/pokemon";

// Types
export interface PokemonBookState {
  // Pagination
  page: number;
  limit: number;
  totalCount: number;

  // Search
  searchQuery: string;

  // Selected Pokemon
  selectedPokemonId: number | null;

  // View mode
  viewMode: "grid" | "list";

  // Async states
  pokemonList: AsyncState<PokemonListItem[], "stale">;
  selectedPokemon: AsyncState<Pokemon, "stale">; // stale to keep previous data while loading
  selectedSpecies: AsyncState<PokemonSpecies, "stale">; // stale to keep previous data while loading

  // Cache for loaded Pokemon details (using Record instead of Map for Immer compatibility)
  pokemonCache: Record<number, Pokemon>;
}

export interface PokemonActions extends ActionsBase {
  loadList: () => Promise<void>;
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  setSearchQuery: (query: string) => void;
  selectPokemon: (id: number | null) => Promise<void>;
  selectNextPokemon: () => Promise<void>;
  selectPrevPokemon: () => Promise<void>;
  closeDetail: () => void;
  toggleViewMode: () => void;
}

// Store
export const pokemonStore = store<PokemonBookState, PokemonActions>({
  name: "pokemon",
  state: {
    page: 0,
    limit: 20,
    totalCount: 0,
    searchQuery: "",
    selectedPokemonId: null,
    viewMode: "grid",
    pokemonList: async.stale<PokemonListItem[]>([]),
    selectedPokemon: async.stale<Pokemon>(undefined as unknown as Pokemon),
    selectedSpecies: async.stale<PokemonSpecies>(
      undefined as unknown as PokemonSpecies
    ),
    pokemonCache: {},
  },
  setup: ({ state, focus, update }) => {
    // Async action for fetching Pokemon list
    const listActions = async.action<PokemonListItem[], "stale", []>(
      focus("pokemonList"),
      async ({ signal }) => {
        const response = await fetchPokemonList(
          state.page * state.limit,
          state.limit,
          signal
        );
        update((s) => {
          s.totalCount = response.count;
        });
        return response.results;
      }
    );

    // Async action for fetching selected Pokemon (stale mode keeps previous data)
    const pokemonActions = async.action(
      focus("selectedPokemon"),
      async ({ signal }, id) => {
        const pokemon = await fetchPokemon(id, signal);
        update((s) => {
          s.pokemonCache[id] = pokemon;
        });
        return pokemon;
      },
      { autoCancel: true }
    );

    // Async action for fetching Pokemon species (stale mode keeps previous data)
    const speciesActions = async.action(
      focus("selectedSpecies"),
      async ({ signal }, id) => fetchPokemonSpecies(id, signal),
      { autoCancel: true }
    );

    return {
      // Load Pokemon list
      loadList: async () => {
        try {
          await listActions.dispatch();
        } catch (e) {
          // Ignore AbortError (expected when request is cancelled)
          if (e instanceof Error && e.name === "AbortError") return;
          throw e;
        }
      },

      // Set page
      setPage: update.action((draft, page: number) => {
        draft.page = page;
      }),

      // Next page
      nextPage: () => {
        const maxPage = Math.ceil(state.totalCount / state.limit) - 1;
        if (state.page < maxPage) {
          update((s) => {
            s.page += 1;
          });
        }
      },

      // Previous page
      prevPage: () => {
        if (state.page > 0) {
          update((s) => {
            s.page -= 1;
          });
        }
      },

      // Set search query
      setSearchQuery: update.action((draft, query: string) => {
        draft.searchQuery = query;
      }),

      // Select Pokemon
      selectPokemon: async (id: number | null) => {
        update((s) => {
          s.selectedPokemonId = id;
        });

        if (id === null) {
          return;
        }

        // Fetch Pokemon and species in parallel
        try {
          await Promise.all([
            pokemonActions.dispatch(id),
            speciesActions.dispatch(id),
          ]);
        } catch (e) {
          // Ignore AbortError (expected when request is cancelled)
          if (e instanceof Error && e.name === "AbortError") return;
          throw e;
        }
      },

      // Navigate to next Pokemon in the list
      selectNextPokemon: async () => {
        const currentId = state.selectedPokemonId;
        if (currentId === null) return;

        // Find current position and get next
        const list = state.pokemonList.data || [];
        const currentIndex = list.findIndex(
          (p) => getIdFromUrl(p.url) === currentId
        );
        if (currentIndex === -1 || currentIndex >= list.length - 1) return;

        const nextId = getIdFromUrl(list[currentIndex + 1].url);
        update((s) => {
          s.selectedPokemonId = nextId;
        });

        try {
          await Promise.all([
            pokemonActions.dispatch(nextId),
            speciesActions.dispatch(nextId),
          ]);
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") return;
          throw e;
        }
      },

      // Navigate to previous Pokemon in the list
      selectPrevPokemon: async () => {
        const currentId = state.selectedPokemonId;
        if (currentId === null) return;

        // Find current position and get previous
        const list = state.pokemonList.data || [];
        const currentIndex = list.findIndex(
          (p) => getIdFromUrl(p.url) === currentId
        );
        if (currentIndex <= 0) return;

        const prevId = getIdFromUrl(list[currentIndex - 1].url);
        update((s) => {
          s.selectedPokemonId = prevId;
        });

        try {
          await Promise.all([
            pokemonActions.dispatch(prevId),
            speciesActions.dispatch(prevId),
          ]);
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") return;
          throw e;
        }
      },

      // Close detail view
      closeDetail: () => {
        update((s) => {
          s.selectedPokemonId = null;
        });
      },

      // Toggle view mode
      toggleViewMode: update.action((draft) => {
        draft.viewMode = draft.viewMode === "grid" ? "list" : "grid";
      }),
    };
  },
});

// Selector for detail navigation info
export const detailNavigationSelector: Selector<{
  hasPrev: boolean;
  hasNext: boolean;
  currentIndex: number;
  total: number;
}> = ({ get }) => {
  const [state] = get(pokemonStore);
  const list = state.pokemonList.data || [];
  const currentId = state.selectedPokemonId;

  if (currentId === null || list.length === 0) {
    return { hasPrev: false, hasNext: false, currentIndex: -1, total: 0 };
  }

  const currentIndex = list.findIndex((p) => getIdFromUrl(p.url) === currentId);

  return {
    hasPrev: currentIndex > 0,
    hasNext: currentIndex < list.length - 1 && currentIndex !== -1,
    currentIndex,
    total: list.length,
  };
};

// Selector for filtered Pokemon list
export const filteredPokemonSelector: Selector<PokemonListItem[]> = ({
  get,
}) => {
  const [state] = get(pokemonStore);
  const list = state.pokemonList.data || [];

  // Filter by search query
  let filtered = list;
  if (state.searchQuery) {
    const query = state.searchQuery.toLowerCase();
    filtered = filtered.filter((p) => p.name.toLowerCase().includes(query));
  }

  return filtered;
};

// Selector for pagination info
export const paginationSelector: Selector<{
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  showing: string;
}> = ({ get }) => {
  const [state] = get(pokemonStore);
  const totalPages = Math.ceil(state.totalCount / state.limit);

  return {
    page: state.page,
    totalPages,
    hasNext: state.page < totalPages - 1,
    hasPrev: state.page > 0,
    showing:
      state.totalCount > 0
        ? `${state.page * state.limit + 1}-${Math.min(
            (state.page + 1) * state.limit,
            state.totalCount
          )} of ${state.totalCount}`
        : "0 of 0",
  };
};

// Helper to extract ID from list item
export function getPokemonIdFromItem(item: PokemonListItem): number {
  return getIdFromUrl(item.url);
}
