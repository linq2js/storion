# Changelog

<script setup>
import { data } from './changelog.data'
</script>

<style>
.changelog-content h2 {
  margin-top: 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--vp-c-divider);
  font-size: 1.5rem;
}

.changelog-content h2:first-child {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.changelog-content h3 {
  margin-top: 1.5rem;
  font-size: 1.1rem;
  color: var(--vp-c-brand-1);
}

.changelog-content ul {
  padding-left: 1.5rem;
  margin: 0.75rem 0;
}

.changelog-content li {
  margin: 0.5rem 0;
  line-height: 1.6;
}

.changelog-content code {
  background: var(--vp-c-bg-soft);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-size: 0.9em;
}

.changelog-content pre {
  background: var(--vp-c-bg-soft);
  padding: 1rem;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1rem 0;
}

.changelog-content pre code {
  background: transparent;
  padding: 0;
}

.changelog-content a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.changelog-content a:hover {
  text-decoration: underline;
}

.changelog-content hr {
  margin: 2rem 0;
  border: none;
  border-top: 1px solid var(--vp-c-divider);
}

.changelog-content strong {
  color: var(--vp-c-text-1);
}

.changelog-content p {
  margin: 0.75rem 0;
  line-height: 1.7;
}
</style>

<div class="changelog-content" v-html="data"></div>

