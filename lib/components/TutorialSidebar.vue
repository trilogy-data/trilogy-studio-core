<template>
    <div class="tutorial-container">
        <nav class="tutorial-nav">
            <ul>
                <li><a class="header" href="#demo">Your First Query</a>
                    <div>An introductory tour.</div>
                </li>
                <li><a class="header" href="#querying">Querying</a>
                    <div>Learn about how to run queries.</div>
                </li>
                <li><a class="header" href="#connections">Connections</a>
                    <div>Learn about connecting to backends</div>
                </li>
                <li><a class="header" href="#models">Models</a>
                    <div>Learn about Trilogy models.</div>
                </li>
                <li><a class="header" href="#data-and-privacy">Data and Privacy</a>
                    <div>Learn about data and privacy in the studio.</div>
                </li>
                <li><a class="header" href="#telemetry">Telemetry</a>
                    <div>Learn about collected telemetry.</div>
                </li>
            </ul>
        </nav>
    </div>
</template>

<script lang="ts">
export default {
    name: 'TutorialSidebarComponent'
};
</script>


<style scoped>
.header {
    font-size: 20px;
}

.tutorial-container {
    display: flex;
    color: var(--text-color);
}

.tutorial-nav ul {
    list-style: none;
    padding: 10px;
    margin-bottom: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.tutorial-nav a {
    text-decoration: none;
    color: #007bff;
}

.tutorial-nav a:hover {
    text-decoration: underline;
}
</style>