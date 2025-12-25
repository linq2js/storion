# Live Demos

Try Storion in action with these interactive demos.

<style>
.demo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-top: 2rem;
}

.demo-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 1.5rem;
  transition: all 0.3s ease;
  background: var(--vp-c-bg-soft);
}

.demo-card:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
}

.demo-card h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.25rem;
}

.demo-card p {
  color: var(--vp-c-text-2);
  margin: 0 0 1rem 0;
  font-size: 0.9rem;
}

.demo-card .tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.demo-card .tag {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.demo-card .actions {
  display: flex;
  gap: 0.75rem;
}

.demo-card .actions a {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.2s ease;
}

.demo-card .actions .primary {
  background: var(--vp-c-brand-1);
  color: white;
}

.demo-card .actions .primary:hover {
  background: var(--vp-c-brand-2);
}

.demo-card .actions .secondary {
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-1);
}

.demo-card .actions .secondary:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
</style>

<div class="demo-grid">
  <div class="demo-card">
    <h3>✅ Task Manager</h3>
    <p>Full-featured task management app with categories, priorities, and filters. Showcases list() and map() helpers.</p>
    <div class="tags">
      <span class="tag">list()</span>
      <span class="tag">map()</span>
      <span class="tag">Focus Helpers</span>
    </div>
    <div class="actions">
      <a href="/storion/demos/tasks/" class="primary demo-link">Live Demo →</a>
      <a href="https://github.com/linq2js/storion/tree/main/packages/task-manager" class="secondary">Source</a>
    </div>
  </div>

  <div class="demo-card">
    <h3>📊 Widget Dashboard</h3>
    <p>Dynamic dashboard with customizable widgets. Add, remove, edit, and duplicate widgets using map() helper.</p>
    <div class="tags">
      <span class="tag">map()</span>
      <span class="tag">Dynamic State</span>
      <span class="tag">CRUD</span>
    </div>
    <div class="actions">
      <a href="/storion/demos/dashboard/" class="primary demo-link">Live Demo →</a>
      <a href="https://github.com/linq2js/storion/tree/main/packages/dashboard" class="secondary">Source</a>
    </div>
  </div>

  <div class="demo-card">
    <h3>🎯 Feature Showcase</h3>
    <p>Comprehensive demo showcasing all Storion features: stores, effects, async state, persistence, and more.</p>
    <div class="tags">
      <span class="tag">Stores</span>
      <span class="tag">Effects</span>
      <span class="tag">Async</span>
      <span class="tag">Persistence</span>
    </div>
    <div class="actions">
      <a href="/storion/demos/showcase/" class="primary demo-link">Live Demo →</a>
      <a href="https://github.com/linq2js/storion/tree/main/packages/feature-showcase" class="secondary">Source</a>
    </div>
  </div>

  <div class="demo-card">
    <h3>🐱 Pokemon App</h3>
    <p>Search and browse Pokemon with async data fetching, caching, and infinite scroll.</p>
    <div class="tags">
      <span class="tag">API Integration</span>
      <span class="tag">Async State</span>
      <span class="tag">Search</span>
    </div>
    <div class="actions">
      <a href="/storion/demos/pokemon/" class="primary demo-link">Live Demo →</a>
      <a href="https://github.com/linq2js/storion/tree/main/packages/pokemon" class="secondary">Source</a>
    </div>
  </div>

  <div class="demo-card">
    <h3>💬 Chat App</h3>
    <p>Real-time chat application with rooms, users, and cross-tab synchronization.</p>
    <div class="tags">
      <span class="tag">Real-time</span>
      <span class="tag">IndexedDB</span>
      <span class="tag">Multi-store</span>
    </div>
    <div class="actions">
      <a href="/storion/demos/chat/" class="primary demo-link">Live Demo →</a>
      <a href="https://github.com/linq2js/storion/tree/main/packages/chat" class="secondary">Source</a>
    </div>
  </div>

  <div class="demo-card">
    <h3>💰 Expense Manager</h3>
    <p>Clean architecture example with domain-driven design, use cases, and repositories.</p>
    <div class="tags">
      <span class="tag">Clean Architecture</span>
      <span class="tag">DDD</span>
      <span class="tag">DI</span>
    </div>
    <div class="actions">
      <a href="/storion/demos/expense/" class="primary demo-link">Live Demo →</a>
      <a href="https://github.com/linq2js/storion/tree/main/packages/expense-manager" class="secondary">Source</a>
    </div>
  </div>
</div>

<script setup>
import { onMounted } from 'vue'

onMounted(() => {
  // Force demo links to do full page navigation instead of VitePress SPA routing
  document.querySelectorAll('.demo-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault()
      window.location.href = link.getAttribute('href')
    })
  })
})
</script>

## Running Locally

Clone the repo and run any demo:

```bash
git clone https://github.com/linq2js/storion.git
cd storion
pnpm install

# Run a specific demo
pnpm --filter task-manager dev
pnpm --filter dashboard dev
pnpm --filter feature-showcase dev
pnpm --filter pokemon dev
pnpm --filter chat dev
pnpm --filter expense-manager dev
```

