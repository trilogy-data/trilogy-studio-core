<template>
    <div class="sidebar-list">
        <h3 class="font-sans mb-1 ">{{ title }}</h3>
        <slot name="actions">
        </slot>
        <div>
            <slot></slot>
        </div>
    </div>
</template>

<style scoped>
.sidebar-list {
    border-radius: 0px;
    padding-left: 4px;
    padding-right: 4px;
    height: 100%;
}
.mb-1 {
    font-weight: 400;
    margin-top: 5px;
    margin-bottom:10px;
}
</style>
<script lang="ts">
import { title } from 'process';
import { defineComponent } from 'vue';

export default defineComponent({
    name: 'SidebarList',
    props: {
        title: {
            type: String,
            required: true
        }
    },
    setup(props) {
        return {
            title: props.title
        }
    }
})
</script>