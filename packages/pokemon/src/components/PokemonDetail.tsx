import { useEffect } from "react";
import { withStore } from "storion/react";
import type { PokemonSpecies, PokemonType, PokemonAbility, PokemonStat } from "../api/pokemon";
import { formatPokemonName, getArtworkUrl } from "../api/pokemon";
import { pokemonStore, detailNavigationSelector } from "../stores/pokemonStore";

// Type badge component
function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`type-${type} px-3 py-1 rounded-full text-xs font-semibold text-white capitalize`}
    >
      {type}
    </span>
  );
}

// Stat bar component
function StatBar({ name, value, max = 255 }: { name: string; value: number; max?: number }) {
  const percentage = (value / max) * 100;
  const statNames: Record<string, string> = {
    hp: "HP",
    attack: "ATK",
    defense: "DEF",
    "special-attack": "SP.ATK",
    "special-defense": "SP.DEF",
    speed: "SPD",
  };

  const getStatColor = (val: number) => {
    if (val >= 150) return "bg-emerald-500";
    if (val >= 100) return "bg-green-500";
    if (val >= 75) return "bg-yellow-500";
    if (val >= 50) return "bg-orange-500";
    return "bg-red-500";
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-400 w-14 text-right">
        {statNames[name] || name}
      </span>
      <span className="text-xs font-mono text-zinc-300 w-8">{value}</span>
      <div className="flex-1 h-2 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${getStatColor(value)} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// Loading skeleton
function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="w-48 h-48 mx-auto bg-zinc-700 rounded-full" />
      <div className="space-y-2">
        <div className="h-8 bg-zinc-700 rounded w-1/2 mx-auto" />
        <div className="h-4 bg-zinc-700 rounded w-1/4 mx-auto" />
      </div>
      <div className="flex justify-center gap-2">
        <div className="h-6 bg-zinc-700 rounded-full w-16" />
        <div className="h-6 bg-zinc-700 rounded-full w-16" />
      </div>
    </div>
  );
}

// Navigation arrow icon
function NavArrow({ direction }: { direction: "prev" | "next" }) {
  const isPrev = direction === "prev";
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
        d={isPrev ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"}
      />
    </svg>
  );
}

// Main detail component
export const PokemonDetail = withStore(
  (ctx) => {
    const [state, actions] = ctx.get(pokemonStore);
    const nav = ctx.mixin(detailNavigationSelector);
    return {
      pokemon: state.selectedPokemon,
      species: state.selectedSpecies,
      isLoading: state.selectedPokemon.status === "pending",
      hasData: !!state.selectedPokemon.data,
      closeDetail: actions.closeDetail,
      selectNextPokemon: actions.selectNextPokemon,
      selectPrevPokemon: actions.selectPrevPokemon,
      hasPrev: nav.hasPrev,
      hasNext: nav.hasNext,
    };
  },
  ({ pokemon, species, isLoading, hasData, closeDetail, selectNextPokemon, selectPrevPokemon, hasPrev, hasNext }) => {
    const pokemonData = pokemon.data;
    const speciesData = species.data;

    // Keyboard navigation
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "ArrowLeft" && hasPrev) {
          selectPrevPokemon();
        } else if (e.key === "ArrowRight" && hasNext) {
          selectNextPokemon();
        } else if (e.key === "Escape") {
          closeDetail();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [hasPrev, hasNext, selectPrevPokemon, selectNextPokemon, closeDetail]);

    // Get English flavor text
    const getFlavorText = (species: PokemonSpecies | undefined) => {
      if (!species) return null;
      const entry = species.flavor_text_entries.find(
        (e) => e.language.name === "en"
      );
      return entry?.flavor_text.replace(/\f/g, " ").replace(/\n/g, " ");
    };

    // Get English genus
    const getGenus = (species: PokemonSpecies | undefined) => {
      if (!species) return null;
      const entry = species.genera.find((g) => g.language.name === "en");
      return entry?.genus;
    };

    // Show skeleton only if no data at all, otherwise show stale data with loading indicator
    const showSkeleton = !hasData;
    const showLoadingOverlay = isLoading && hasData;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
        <div className="relative bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
          {/* Close button */}
          <button
            onClick={closeDetail}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors"
            title="Close (Esc)"
          >
            <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Loading overlay for stale data */}
          {showLoadingOverlay && (
            <div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-[2px] z-30 flex items-center justify-center rounded-2xl">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-3 border-zinc-600 border-t-white rounded-full animate-spin" />
                <span className="text-sm text-zinc-400">Loading...</span>
              </div>
            </div>
          )}

          {showSkeleton ? (
            <div className="p-8">
              <DetailSkeleton />
            </div>
          ) : (
            <>
              {/* Header with image */}
              <div className="relative pt-8 pb-4 px-6 bg-gradient-to-b from-zinc-800/50 to-transparent">
                {/* Pokemon number */}
                <div className="absolute top-4 left-4 text-lg font-mono text-zinc-500">
                  #{String(pokemonData.id).padStart(4, "0")}
                </div>

                {/* Pokemon image with navigation buttons */}
                <div className="flex items-center justify-center gap-2">
                  {/* Previous button */}
                  <button
                    onClick={selectPrevPokemon}
                    disabled={!hasPrev}
                    className={`p-3 rounded-full transition-all ${
                      hasPrev
                        ? "bg-zinc-800 hover:bg-zinc-700 text-white hover:scale-110"
                        : "bg-zinc-800/30 text-zinc-600 cursor-not-allowed"
                    }`}
                    title="Previous Pokémon (←)"
                  >
                    <NavArrow direction="prev" />
                  </button>

                  {/* Image */}
                  <div className="w-48 h-48 relative shrink-0">
                    <div className="absolute inset-0 bg-zinc-700/30 rounded-full animate-pulse" />
                    <img
                      src={getArtworkUrl(pokemonData)}
                      alt={pokemonData.name}
                      className="relative w-full h-full object-contain drop-shadow-2xl animate-bounce-slow"
                    />
                  </div>

                  {/* Next button */}
                  <button
                    onClick={selectNextPokemon}
                    disabled={!hasNext}
                    className={`p-3 rounded-full transition-all ${
                      hasNext
                        ? "bg-zinc-800 hover:bg-zinc-700 text-white hover:scale-110"
                        : "bg-zinc-800/30 text-zinc-600 cursor-not-allowed"
                    }`}
                    title="Next Pokémon (→)"
                  >
                    <NavArrow direction="next" />
                  </button>
                </div>

                {/* Name and genus */}
                <div className="text-center mt-4">
                  <h2 className="text-2xl font-bold text-white">
                    {formatPokemonName(pokemonData.name)}
                  </h2>
                  {getGenus(speciesData) && (
                    <p className="text-sm text-zinc-400 mt-1">
                      {getGenus(speciesData)}
                    </p>
                  )}
                </div>

                {/* Types */}
                <div className="flex justify-center gap-2 mt-3">
                  {pokemonData.types.map((t: PokemonType) => (
                    <TypeBadge key={t.type.name} type={t.type.name} />
                  ))}
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Description */}
                {getFlavorText(speciesData) && (
                  <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
                    <p className="text-sm text-zinc-300 leading-relaxed">
                      {getFlavorText(speciesData)}
                    </p>
                  </div>
                )}

                {/* Physical info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50 text-center">
                    <div className="text-2xl font-bold text-white">
                      {(pokemonData.height / 10).toFixed(1)}m
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">Height</div>
                  </div>
                  <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50 text-center">
                    <div className="text-2xl font-bold text-white">
                      {(pokemonData.weight / 10).toFixed(1)}kg
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">Weight</div>
                  </div>
                </div>

                {/* Abilities */}
                <div>
                  <h3 className="text-sm font-semibold text-zinc-400 mb-2">
                    Abilities
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {pokemonData.abilities.map((a: PokemonAbility) => (
                      <span
                        key={a.ability.name}
                        className={`px-3 py-1.5 rounded-lg text-sm capitalize ${
                          a.is_hidden
                            ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            : "bg-zinc-800 text-zinc-300 border border-zinc-700"
                        }`}
                      >
                        {a.ability.name.replace("-", " ")}
                        {a.is_hidden && (
                          <span className="ml-1 text-xs opacity-60">
                            (Hidden)
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div>
                  <h3 className="text-sm font-semibold text-zinc-400 mb-3">
                    Base Stats
                  </h3>
                  <div className="space-y-2">
                    {pokemonData.stats.map((stat: PokemonStat) => (
                      <StatBar
                        key={stat.stat.name}
                        name={stat.stat.name}
                        value={stat.base_stat}
                      />
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-zinc-700/50 flex justify-between text-sm">
                    <span className="text-zinc-400">Total</span>
                    <span className="font-semibold text-white">
                      {pokemonData.stats.reduce(
                        (sum: number, s: PokemonStat) => sum + s.base_stat,
                        0
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
);

