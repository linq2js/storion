import { memo } from "react";
import type { PokemonListItem } from "../api/pokemon";
import { formatPokemonName, getIdFromUrl } from "../api/pokemon";

interface PokemonCardProps {
  pokemon: PokemonListItem;
  onClick: () => void;
  viewMode: "grid" | "list";
}

export const PokemonCard = memo(function PokemonCard({
  pokemon,
  onClick,
  viewMode,
}: PokemonCardProps) {
  const id = getIdFromUrl(pokemon.url);
  const imageUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
  const formattedName = formatPokemonName(pokemon.name);

  if (viewMode === "list") {
    return (
      <button
        onClick={onClick}
        className="w-full flex items-center gap-4 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50 hover:bg-zinc-700/50 hover:border-zinc-600 transition-all group"
      >
        <div className="w-12 h-12 bg-zinc-900/50 rounded-lg p-1 flex-shrink-0">
          <img
            src={imageUrl}
            alt={pokemon.name}
            className="w-full h-full object-contain group-hover:scale-110 transition-transform"
            loading="lazy"
          />
        </div>
        <div className="flex-1 text-left">
          <div className="font-medium text-zinc-100">{formattedName}</div>
          <div className="text-xs text-zinc-500">#{String(id).padStart(4, "0")}</div>
        </div>
        <div className="text-zinc-500 group-hover:text-zinc-300 transition-colors">
          →
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="group relative bg-zinc-800/50 rounded-xl border border-zinc-700/50 p-4 hover:bg-zinc-700/50 hover:border-zinc-600 hover:scale-105 transition-all overflow-hidden"
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-700/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Pokemon number */}
      <div className="absolute top-2 right-2 text-xs font-mono text-zinc-500 group-hover:text-zinc-400">
        #{String(id).padStart(4, "0")}
      </div>

      {/* Pokemon image */}
      <div className="relative w-24 h-24 mx-auto mb-2">
        <div className="absolute inset-0 bg-zinc-900/30 rounded-full scale-75" />
        <img
          src={imageUrl}
          alt={pokemon.name}
          className="relative w-full h-full object-contain drop-shadow-lg group-hover:scale-110 transition-transform duration-300"
          loading="lazy"
        />
      </div>

      {/* Pokemon name */}
      <div className="text-center">
        <div className="font-medium text-zinc-100 group-hover:text-white">
          {formattedName}
        </div>
      </div>
    </button>
  );
});

