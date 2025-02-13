<template>
    <div class="relative inline-block">
        <button class="btn flex" :disabled="isLoading" @click="handleClick">
            <transition name="fade" mode="out-in">

                <span v-if="status === 'success'" class="green">✔</span>
                <span v-else-if="status === 'error'" class="red">✖</span>
                <span v-else-if="isLoading" class="spinner"></span>
                <span v-else>
                    <slot></slot>
                </span>
            </transition>

        </button>

    </div>
</template>

<script lang="ts">
import { ref } from 'vue';

export default {
    props: {
        action: {
            type: Function,
            required: true,
        },
    },
    setup(props) {
        const isLoading = ref(false);
        const status = ref<'success' | 'error' | null>(null);

        const handleClick = async () => {
            isLoading.value = true;
            status.value = null; // Reset status before running action
            const startTime = Date.now();
            let localStatus: 'success' | 'error' | null = null;
            try {
                await props.action();
                localStatus = 'success';
            } catch (error) {
                console.error(error);
                localStatus = 'error';
            } finally {
                const elapsedTime = Date.now() - startTime;
                const remainingTime = Math.max(500 - elapsedTime, 0);
                await new Promise((resolve) => setTimeout(resolve, remainingTime));
                status.value = localStatus;
                isLoading.value = false;
                // Clear status after a brief delay
                setTimeout(() => {
                    status.value = null;
                }, 1500);
            }
        };

        return {
            isLoading,
            status,
            handleClick,
        };
    },
};
</script>

<style>
.red {
    color: red;
}

.green {
    color: green;
}

.btn {
    min-width: 35px;
    border: 2px solid transparent;
}

.spinner {
    display: inline-block;
    width: 35%;
    aspect-ratio: 1 / 1;
    border: 2px solid transparent;
    border-top-color: var(--color);
    border-radius: 50%;
    animation: spin .75s linear infinite;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.05s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
