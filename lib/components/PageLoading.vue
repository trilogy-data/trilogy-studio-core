<template>
  <div class="page-loading" role="status" aria-label="Loading page">
    <div class="page-loading__bar">
      <span class="skeleton skeleton--chip"></span>
      <span class="skeleton skeleton--title"></span>
      <span class="skeleton skeleton--chip"></span>
    </div>
    <div class="page-loading__body">
      <span class="skeleton skeleton--line skeleton--w60"></span>
      <span class="skeleton skeleton--line skeleton--w40"></span>
      <span class="skeleton skeleton--block"></span>
      <div class="page-loading__row">
        <span class="skeleton skeleton--card"></span>
        <span class="skeleton skeleton--card"></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-loading {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 200px;
  background-color: var(--bg-color);
  overflow: hidden;
}

.page-loading__bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.page-loading__bar .skeleton--title {
  flex: 0 1 220px;
  height: 16px;
}

.page-loading__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1 1 auto;
  min-height: 0;
  padding: 18px 14px;
}

.page-loading__row {
  display: flex;
  gap: 14px;
  flex: 1 1 auto;
  min-height: 0;
}

.skeleton {
  display: block;
  border-radius: 6px;
  background-color: rgba(148, 163, 184, 0.14);
  background-image: linear-gradient(
    90deg,
    transparent 0%,
    rgba(148, 163, 184, 0.16) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  background-position: -100% 0;
  animation: page-loading-shimmer 1.4s ease-in-out infinite;
}

.skeleton--chip {
  width: 34px;
  height: 16px;
  flex-shrink: 0;
}

.skeleton--line {
  height: 12px;
}

.skeleton--w60 {
  width: 60%;
}

.skeleton--w40 {
  width: 40%;
}

.skeleton--block {
  height: 26vh;
  min-height: 120px;
  flex-shrink: 0;
}

.skeleton--card {
  flex: 1 1 0;
  min-height: 100px;
}

@keyframes page-loading-shimmer {
  to {
    background-position: 100% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
  }
}
</style>
