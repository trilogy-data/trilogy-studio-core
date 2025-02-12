<template>
    <div class="tutorial-container">
        <section id="demo" class="tutorial-section">
        <h2>Demo</h2>
        <p>The demo experience will take you on a tour of capabilities. </p>
      </section>
  
      <section id="querying" class="tutorial-section">
        <h2>Querying</h2>
        <p>The primary function of trilogy studio is letting you run queries in the Trilogy or SQL against supported backends.</p>
        <p>When creating an editor, you will select a type. Trilogy editors run Trilogy code; SQL editors run SQL. An editor must be associated with a connection and may be associated with a model.</p>
        <p>When running trilogy queries, your command will first go to a backend server to be parsed/typechecked, then the output SQL will be returned to the editor to execute as a normal SQL query.</p>
      </section>
  
      <section id="connections" class="tutorial-section">
        <h2>Connections</h2>
        <p>Editors must be associated with a connection. A connection represents a particular underlying backend database resource. Many IDEs can share one connection, but only a single query can be executed on a connection at a single point in time.</p>
      </section>
  
      <section id="models" class="tutorial-section">
        <h2>Models</h2>
        <p>Models are the Trilogy semantic layer. When you run a Trilogy command in an editor associated with a model, it will be able to import all included files and reference them.</p>
      </section>
  
      <section id="data-and-privacy" class="tutorial-section">
        <h2>Data and Privacy</h2>
        <p>The content of a Trilogy IDE (or selected subset) + defined model source files will be sent to a remote server to generate SQL. This contains no other identifying information beyond the editor text and associated model editor texts sent.</p>
        <p>All other operations will be between your local machine and services you control, such as querying any database you configured.</p>
  
        <h3>Product Specific</h3>
        <h4>Google</h4>
        <p>For google products (Bigquery, etc), we will use the google-javascript-api to authenticate as your account on the client side.</p>
  
        <h4>Other</h4>
        <p>For other databases that require secrets, we will use the browser credential API to store your credentials locally and prompt you before accessing them. These credentials are never sent to a backend.</p>
      </section>
  
      <section id="telemetry" class="tutorial-section">
        <h2>Telemetry</h2>
        <p>We use <a href="https://www.goatcounter.com/">GoatCounter</a> to connect anonymized statistics about usage.</p>
      </section>
    </div>
  </template>
  
  <script lang="ts">
  export default {
    name: 'TutorialComponent'
  };
  </script>
  
  <style scoped>
  .tutorial-container {
    padding: 1rem;
    color: var(--text-color);
    overflow-y:scroll;
  }
  
  .tutorial-section {
    margin-bottom: 2rem;
  }
  </style>