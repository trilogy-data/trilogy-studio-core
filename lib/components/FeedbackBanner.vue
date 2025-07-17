<template>
  <div class="feedback-banner">
    <div class="feedback-content">
      <span class="feedback-text">
        Your feedback helps shape the future of Trilogy. Tell us what worked — or didn't.
      </span>
      <a
        href="https://forms.gle/r1V7nxdW712ch4XVA"
        target="_blank"
        class="feedback-link"
        rel="noopener noreferrer"
      >
        Give Feedback
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
// No props or logic needed for this simple banner
</script>

<style scoped>
.feedback-banner {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  color: white;
  width: 100%;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 2px 0;
}

.feedback-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 0 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.feedback-text {
  font-size: 14px;
  font-weight: 500;
  text-align: center;
  /* Removed flex: 1 to prevent taking up all space */
}

.feedback-link {
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  text-decoration: none;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s ease;
  white-space: nowrap;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.feedback-link:hover {
  background-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.feedback-link:active {
  transform: translateY(0);
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .feedback-content {
    flex-direction: column;
    gap: 12px;
    padding: 0 16px;
  }

  .feedback-text {
    font-size: 13px;
    text-align: center;
  }

  .feedback-link {
    font-size: 13px;
    padding: 6px 14px;
  }
}

@media (max-width: 480px) {
  .feedback-banner {
    padding: 2px 0;
  }

  .feedback-text {
    font-size: 12px;
    line-height: 1.4;
  }

  .feedback-link {
    font-size: 12px;
    padding: 6px 12px;
  }
}
</style>
