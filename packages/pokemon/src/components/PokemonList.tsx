import { useEffect } from "react";
import { withStore } from "storion/react";
import { pokemonStore, filteredPokemonSelector, getPokemonIdFromItem } from "../stores/pokemonStore";
import { PokemonCard } from "./PokemonCard";

// Loading skeleton
function LoadingSkeleton({ viewMode }: { viewMode: "grid" | "list" }) {
  const items = Array.from({ length: 12 }, (_, i) => i);

  if (viewMode === "list") {
    return (
      <div className="space-y-2">
        {items.map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-3 bg-zinc-800/50 rounded-lg animate-pulse"
          >
            <div className="w-12 h-12 bg-zinc-700 rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-zinc-700 rounded w-1/3" />
              <div className="h-3 bg-zinc-700 rounded w-1/6" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {items.map((i) => (
        <div
          key={i}
          className="bg-zinc-800/50 rounded-xl p-4 animate-pulse"
        >
          <div className="w-24 h-24 mx-auto bg-zinc-700 rounded-full mb-2" />
          <div className="h-4 bg-zinc-700 rounded w-2/3 mx-auto" />
        </div>
      ))}
    </div>
  );
}

// Empty state
function EmptyState({ searchQuery }: { searchQuery: string }) {
  return (
    <div className="text-center py-12">
      <div className="text-6xl mb-4">🔍</div>
      <h3 className="text-lg font-semibold text-zinc-300 mb-2">
        No Pokémon found
      </h3>
      <p className="text-zinc-500">
        {searchQuery
          ? `No results for "${searchQuery}"`
          : "Try adjusting your search or filters"}
      </p>
    </div>
  );
}

export const PokemonList = withStore(
  (ctx) => {
    const [state, actions] = ctx.get(pokemonStore);
    const filteredPokemon = ctx.mixin(filteredPokemonSelector);

    return {
      pokemonList: filteredPokemon,
      isLoading: state.pokemonList.status === "pending",
      isError: state.pokemonList.status === "error",
      error: state.pokemonList.error,
      viewMode: state.viewMode,
      searchQuery: state.searchQuery,
      loadList: actions.loadList,
      selectPokemon: actions.selectPokemon,
    };
  },
  ({
    pokemonList,
    isLoading,
    isError,
    error,
    viewMode,
    searchQuery,
    loadList,
    selectPokemon,
  }) => {
    // Load initial data
    useEffect(() => {
      if (pokemonList.length === 0 && !isLoading) {
        loadList();
      }
    }, []);

    if (isError) {
      return (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">😵</div>
          <h3 className="text-lg font-semibold text-red-400 mb-2">
            Failed to load Pokémon
          </h3>
          <p className="text-zinc-500 mb-4">{error?.message}</p>
          <button
            onClick={loadList}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    if (isLoading && pokemonList.length === 0) {
      return <LoadingSkeleton viewMode={viewMode} />;
    }

    if (pokemonList.length === 0) {
      return <EmptyState searchQuery={searchQuery} />;
    }

    return (
      <div className="relative">
        {/* Loading overlay */}
        {isLoading && pokemonList.length > 0 && (
          <div className="absolute inset-0 bg-zinc-900/50 flex items-center justify-center z-10 rounded-xl">
            <div className="flex items-center gap-3 bg-zinc-800 px-4 py-2 rounded-lg">
              <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-zinc-300">Loading...</span>
            </div>
          </div>
        )}

        {viewMode === "list" ? (
          <div className="space-y-2">
            {pokemonList.map((pokemon) => (
              <PokemonCard
                key={pokemon.name}
                pokemon={pokemon}
                viewMode={viewMode}
                onClick={() => selectPokemon(getPokemonIdFromItem(pokemon))}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {pokemonList.map((pokemon) => (
              <PokemonCard
                key={pokemon.name}
                pokemon={pokemon}
                viewMode={viewMode}
                onClick={() => selectPokemon(getPokemonIdFromItem(pokemon))}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

