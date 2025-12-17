import { withStore } from "storion/react";
import { pokemonStore } from "./stores/pokemonStore";
import { SearchBar, PokemonList, PokemonDetail, Pagination } from "./components";

// Header component
function Header() {
  return (
    <header className="bg-gradient-to-r from-red-600 to-red-500 shadow-lg shadow-red-500/20">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center gap-3">
          {/* Pokeball icon */}
          <div className="w-10 h-10 relative">
            <div className="absolute inset-0 bg-white rounded-full" />
            <div className="absolute inset-0 bg-red-500 rounded-full clip-half-top" />
            <div className="absolute top-1/2 left-0 right-0 h-1 bg-zinc-800 -translate-y-1/2" />
            <div className="absolute top-1/2 left-1/2 w-4 h-4 bg-white rounded-full border-4 border-zinc-800 -translate-x-1/2 -translate-y-1/2" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Pokédex
            </h1>
            <p className="text-xs text-red-100/80">
              Explore the world of Pokémon
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}

// Main app content
const AppContent = withStore(
  (ctx) => {
    const [state] = ctx.get(pokemonStore);
    return {
      selectedPokemonId: state.selectedPokemonId,
    };
  },
  ({ selectedPokemonId }) => (
    <div className="min-h-screen bg-zinc-950">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Search and filters */}
        <div className="mb-6">
          <SearchBar />
        </div>

        {/* Pokemon grid/list */}
        <PokemonList />

        {/* Pagination */}
        <Pagination />
      </main>

      {/* Pokemon detail modal */}
      {selectedPokemonId !== null && <PokemonDetail />}

      {/* Footer */}
      <footer className="border-t border-zinc-800 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-zinc-500">
          <p>
            Data provided by{" "}
            <a
              href="https://pokeapi.co"
              target="_blank"
              rel="noopener noreferrer"
              className="text-red-400 hover:text-red-300 transition-colors"
            >
              PokéAPI
            </a>
          </p>
          <p className="mt-1">
            Built with{" "}
            <span className="text-red-400">Storion</span> +{" "}
            <span className="text-blue-400">React</span>
          </p>
        </div>
      </footer>
    </div>
  )
);

export function App() {
  return <AppContent />;
}

