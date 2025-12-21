---
layout: home

hero:
  name: Storion
  text: Reactive State Management
  tagline: Type-safe. Auto-tracked. Effortlessly composable.
  image:
    src: /logo.svg
    alt: Storion
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Live Demos
      link: /demos
    - theme: alt
      text: GitHub
      link: https://github.com/linq2js/storion

features:
  - icon: 🎯
    title: Auto-tracking
    details: Dependencies tracked automatically when you read state. No manual selectors needed.
  - icon: 🔒
    title: Type-safe
    details: Full TypeScript support with excellent inference. Catch errors at compile time.
  - icon: ⚡
    title: Fine-grained Updates
    details: Only re-render what actually changed. No wasted renders.
  - icon: 🧩
    title: Composable
    details: Mix stores, use dependency injection, create derived values effortlessly.
  - icon: 🔄
    title: Reactive Effects
    details: Side effects that automatically respond to state changes.
  - icon: 📦
    title: Tiny Footprint
    details: ~4KB minified + gzipped. No bloat.
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #6366f1 30%, #a855f7);
  --vp-home-hero-image-background-image: linear-gradient(-45deg, #6366f1 50%, #a855f7 50%);
  --vp-home-hero-image-filter: blur(44px);
}

@media (min-width: 640px) {
  :root {
    --vp-home-hero-image-filter: blur(56px);
  }
}

@media (min-width: 960px) {
  :root {
    --vp-home-hero-image-filter: blur(68px);
  }
}
</style>

## Quick Example

```tsx
import { create } from 'storion/react';

// create() returns [storeInstance, useStore] - no Provider needed!
const [counter, useCounter] = create({
  name: 'counter',
  state: { count: 0 },
  setup({ state }) {
    return {
      increment: () => { state.count++; },
      decrement: () => { state.count--; },
    };
  },
});

function Counter() {
  const { count, increment } = useCounter((state, actions) => ({
    count: state.count,
    increment: actions.increment,
  }));

  return <button onClick={increment}>{count}</button>;
}
```

## Why Storion?

| Feature | Redux | Zustand | Jotai | Storion |
|---------|-------|---------|-------|---------|
| Auto-tracking | ❌ | ❌ | ✅ | ✅ |
| TypeScript | ⚠️ | ✅ | ✅ | ✅ |
| Dependency Injection | ❌ | ❌ | ❌ | ✅ |
| Fine-grained Reactivity | ❌ | ❌ | ✅ | ✅ |
| Middleware | ✅ | ✅ | ❌ | ✅ |
| DevTools | ✅ | ✅ | ⚠️ | ✅ |
| Bundle Size | ~2KB | ~1KB | ~2KB | ~4KB |

## Sponsors

<p align="center">
  <em>Become a sponsor to support Storion development!</em>
</p>

