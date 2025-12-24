<script setup lang="ts">
import { useData } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { ref, onMounted, watch } from "vue";

const { Layout } = DefaultTheme;
const { page } = useData();

const isDemo = ref(false);

// Check on mount and when page changes
const checkIsDemo = () => {
  if (typeof window !== "undefined") {
    const path = window.location.pathname;
    isDemo.value = path.startsWith("/storion/demos/");
  }
};

onMounted(checkIsDemo);
watch(() => page.value.relativePath, checkIsDemo);
</script>

<template>
  <Layout>
    <template #not-found>
      <!-- Show blank page for demo routes -->
      <div v-if="isDemo" class="demo-404"></div>

      <!-- Show default 404 for other routes -->
      <template v-else>
        <div class="NotFound">
          <p class="code">404</p>
          <h1 class="title">PAGE NOT FOUND</h1>
          <div class="divider" />
          <blockquote class="quote">
            But if you don't change your direction, and if you keep looking, you
            may end up where you are heading.
          </blockquote>
          <div class="action">
            <a class="link" href="/storion/" aria-label="go to home">
              Take me home
            </a>
          </div>
        </div>
      </template>
    </template>
  </Layout>
</template>

<style scoped>
.demo-404 {
  min-height: 100vh;
  background: var(--vp-c-bg);
}

.NotFound {
  padding: 64px 24px 96px;
  text-align: center;
}

@media (min-width: 768px) {
  .NotFound {
    padding: 96px 32px 168px;
  }
}

.code {
  line-height: 64px;
  font-size: 64px;
  font-weight: 600;
}

.title {
  padding-top: 12px;
  letter-spacing: 2px;
  line-height: 20px;
  font-size: 20px;
  font-weight: 700;
}

.divider {
  margin: 24px auto 18px;
  width: 64px;
  height: 1px;
  background-color: var(--vp-c-divider);
}

.quote {
  margin: 0 auto;
  max-width: 256px;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}

.action {
  padding-top: 20px;
}

.link {
  display: inline-block;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 16px;
  padding: 3px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  transition:
    border-color 0.25s,
    color 0.25s;
}

.link:hover {
  border-color: var(--vp-c-brand-2);
  color: var(--vp-c-brand-2);
}
</style>

