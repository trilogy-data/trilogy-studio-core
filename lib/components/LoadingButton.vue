<template>
    <button
        class="btn relative flex items-center justify-center px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-400"
        :disabled="isLoading" @click="handleClick">
        <span v-if="!isLoading">
            <slot></slot>
        </span>
        <span v-else class="spinner"></span>
    </button>
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

        const handleClick = async () => {
            isLoading.value = true;
            try {
                await props.action();
            } catch (error) {
                console.error(error);
            } finally {
                isLoading.value = false;
            }
        };

        return {
            isLoading,
            handleClick,
        };
    },
};
</script>

<style>
.spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid transparent;
    border-top-color: white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}
</style>