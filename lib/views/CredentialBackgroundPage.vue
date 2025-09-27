<template>
  <div class="credentials-prompt">
    <div class="credentials-card">
      <div class="credentials-icon">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <circle cx="12" cy="16" r="1"></circle>
          <path d="m7 11 V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      </div>
      <h2 class="credentials-title">Credential response required</h2>
      <p class="credentials-message">Complete credential prompt to continue.</p>
      <div class="credentials-loading">
        <div class="spinner"></div>
        <span>Waiting for authentication...</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.credentials-prompt {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  background: #f8f9fa;
}

.credentials-card {
  background: white;
  border: 1px solid #e0e0e0;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  text-align: center;
  max-width: 400px;
  width: 90%;
}

.credentials-icon {
  color: #0ea5e9;
  margin-bottom: 1rem;
  display: flex;
  justify-content: center;
}

.credentials-title {
  color: #1f2937;
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
}

.credentials-message {
  color: #6b7280;
  font-size: 1rem;
  line-height: 1.5;
  margin: 0 0 1.5rem 0;
}

.credentials-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: #0ea5e9;
  font-size: 0.875rem;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #e5e7eb;
  border-top: 2px solid #0ea5e9;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
