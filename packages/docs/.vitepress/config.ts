import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Storion",
  description:
    "Reactive stores for modern apps. Type-safe. Auto-tracked. Effortlessly composable.",

  base: "/storion/",

  ignoreDeadLinks: [
    // Ignore these until pages are created
    /\/guide\/(actions|dependency-injection|middleware|devtools|meta)/,
    /\/guide\/react\/(with-store|provider)/,
  ],

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/storion/logo.svg" }],
    ["meta", { name: "theme-color", content: "#6366f1" }],
    ["meta", { property: "og:type", content: "website" }],
    [
      "meta",
      { property: "og:title", content: "Storion - Reactive State Management" },
    ],
    [
      "meta",
      {
        property: "og:description",
        content: "Type-safe. Auto-tracked. Effortlessly composable.",
      },
    ],
  ],

  themeConfig: {
    logo: "/logo.svg",

    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API", link: "/api/store" },
      { text: "Examples", link: "/examples/" },
      { text: "Demos", link: "/demos" },
      {
        text: "v0.8.0",
        items: [
          { text: "Changelog", link: "/changelog" },
          { text: "npm", link: "https://www.npmjs.com/package/storion" },
        ],
      },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "What is Storion?", link: "/guide/" },
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Core Concepts", link: "/guide/core-concepts" },
          ],
        },
        {
          text: "Essentials",
          items: [
            { text: "Stores", link: "/guide/stores" },
            { text: "Reactivity", link: "/guide/reactivity" },
            { text: "Actions", link: "/guide/actions" },
            { text: "Effects", link: "/guide/effects" },
          ],
        },
        {
          text: "Advanced",
          items: [
            { text: "Async State", link: "/guide/async" },
            {
              text: "Dependency Injection",
              link: "/guide/dependency-injection",
            },
            { text: "Middleware", link: "/guide/middleware" },
            { text: "Persistence", link: "/guide/persistence" },
            { text: "DevTools", link: "/guide/devtools" },
            { text: "Meta System", link: "/guide/meta" },
          ],
        },
        {
          text: "React",
          items: [
            { text: "useStore", link: "/guide/react/use-store" },
            { text: "withStore", link: "/guide/react/with-store" },
            { text: "StoreProvider", link: "/guide/react/provider" },
          ],
        },
      ],
      "/api/": [
        {
          text: "Core",
          items: [
            { text: "store()", link: "/api/store" },
            { text: "container()", link: "/api/container" },
            { text: "effect()", link: "/api/effect" },
            { text: "trigger()", link: "/api/trigger" },
          ],
        },
        {
          text: "React",
          items: [
            { text: "useStore()", link: "/api/use-store" },
            { text: "StoreProvider", link: "/api/store-provider" },
            { text: "withStore()", link: "/api/with-store" },
          ],
        },
        {
          text: "Async",
          items: [{ text: "async()", link: "/api/async" }],
        },
        {
          text: "Persist",
          items: [
            { text: "persistMiddleware()", link: "/api/persist-middleware" },
            { text: "notPersisted", link: "/api/not-persisted" },
          ],
        },
        {
          text: "Meta",
          items: [{ text: "meta()", link: "/api/meta" }],
        },
      ],
      "/examples/": [
        {
          text: "Examples",
          items: [
            { text: "Overview", link: "/examples/" },
            { text: "Counter", link: "/examples/counter" },
            { text: "Todo App", link: "/examples/todo" },
            { text: "Async Data", link: "/examples/async-data" },
            { text: "Form Validation", link: "/examples/form" },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/linq2js/storion" },
      { icon: "npm", link: "https://www.npmjs.com/package/storion" },
    ],

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2024 linq2js",
    },

    search: {
      provider: "local",
    },

    editLink: {
      pattern:
        "https://github.com/linq2js/storion/edit/main/packages/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
});
