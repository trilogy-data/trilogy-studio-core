<template>
    <div class="chart-placeholder">
        <p>Chart Component</p>
        <p class="chart-query">{{ query }}</p>
    </div>
</template>

<script lang="ts">
import { h, computed, defineComponent } from 'vue';

export default defineComponent({
    name: 'DashboardChart',
    props: {
        itemId: {
            type: String,
            required: true
        },
        getItemData: {
            type: Function,
            required: true,
            default: () => ({ type: 'CHART', content: '' })
        },
        setItemData: {
            type: Function,
            required: true,
            default: () => ({ type: 'CHART', content: '' })
        }
    },
    setup(props) {
        const query = computed(() => {
            return props.getItemData(props.itemId).content;
        });

        return { query };
    },
});
</script>

<style scoped>
.chart-placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 15px;
    color: #666;
}

.chart-query {
    font-family: monospace;
    font-size: 12px;
    margin-top: 10px;
    padding: 8px;
    background-color: #f8f8f8;
    border: 1px solid #ddd;
    border-radius: 4px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>