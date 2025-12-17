import { withStore } from "storion/react";
import { pokemonStore, paginationSelector } from "../stores/pokemonStore";

export const Pagination = withStore(
  (ctx) => {
    const [, actions] = ctx.get(pokemonStore);
    const pagination = ctx.mixin(paginationSelector);
    return {
      ...pagination,
      nextPage: actions.nextPage,
      prevPage: actions.prevPage,
      loadList: actions.loadList,
    };
  },
  ({ page, totalPages, hasNext, hasPrev, showing, nextPage, prevPage, loadList }) => (
    <div className="flex items-center justify-between py-4">
      <div className="text-sm text-zinc-500">{showing}</div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            prevPage();
            loadList();
          }}
          disabled={!hasPrev}
          className="px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-sm font-medium text-zinc-300 hover:bg-zinc-700 hover:border-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          Previous
        </button>

        <span className="px-4 text-sm text-zinc-400">
          Page {page + 1} of {totalPages}
        </span>

        <button
          onClick={() => {
            nextPage();
            loadList();
          }}
          disabled={!hasNext}
          className="px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700 text-sm font-medium text-zinc-300 hover:bg-zinc-700 hover:border-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          Next
        </button>
      </div>
    </div>
  )
);

