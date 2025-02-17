<template>
  <div class="tutorial-container">
    <section id="navigation" class="tutorial-section">
      <h2>Navigation</h2>
      <p>Trilogy Studio uses a left hand navigation bar, a sidebar with context, and main pane (which may be split) to
        present information.
        The sidebar is further split into sections; the first icons change the sidebar for the query editor, while the
        next section configures
        entirely new main screen experiences. Configuration/profile are accessible at the bottom.</p>
      <highlight-component type="tip"> By default, Trilogy Studio stores your editors, connections, and models in
        browser local
        storage. Use the
        save buttons on the left hand nav to record changes. You can also use the keyboard shortcuts <kbd>Ctrl</kbd> +
        <kbd>S</kbd> to save
        your work.</highlight-component>


    </section>
    <section id="demo" class="tutorial-section">
      <h2>Demo</h2>
      <p>The demo will set up a duckdb connection using publically available parquet files as model inputs. It's a great
        way to dive into querying right away.

        If this is your first visit, then the demo will be set up automatically.

        Try the example_query_1 and example_query_2 queries to see how the model can be used to generate SQL, and then
        look at the source model files to see inputs. (you may have to uhide them.)

        Clicking the reset button below will recreate the 'demo-connection' and all associated editors to default state.
        Take care with this, as it will revert any changes you have made. </p>
      <loading-button :action="setupDemo">Reset Demo</loading-button>
    </section>

    <section id="querying" class="tutorial-section">
      <h2>Querying</h2>
      <p>A core feature of Trilogy Studio is running in Trilogy or SQL against connections
        representing backend databases.</p>
      <p>When creating an editor, you will select a type. Trilogy editors run Trilogy code; SQL editors run SQL. An
        editor must be associated with a connection and may be associated with a model.</p>
      <p>When running Trilogy queries, your command will first go to a backend server to be parsed/typechecked, then the
        output SQL will be returned to the editor to be run as a normal SQL query.
        SQL editors will submit directly to the configured connection without the first parsing pass.</p>
    </section>

    <section id="connections" class="tutorial-section">
      <h2>Connections</h2>
      <p>Editors must be associated with a connection. A connection represents a particular underlying backend database
        resource. Many IDEs can share one connection, but only a single query can be executed on a connection at a
        single point in time. Connections are also associated with model, which enables configuration of additional
        editors as semantic sources.
      </p>
      You can view current connections below. Edit the model associated with a connection by clicking the model name
      next to (or set model if not set).
      Connections will not automatically connect on startup by default; click the <i class="mdi mdi-connection"></i>
      button to connect.

      This connection view is always accessible through the connections page on the left side.
      <div class='sidebar-tutorial-container'>
        <connection-list />
      </div>
    </section>

    <section id="models" class="tutorial-section">
      <h2>Models</h2>
      <p>Models are the Trilogy semantic layer. When you run a Trilogy command in a connection with a model associated,
        it
        will be able reference that file as an import in any other editor on the connection. An editor is added to a
        model
        with an alias, which is how it should be referenced.</p>

      <highlight-component type="tip"> Any editor can be turned into a model source. By default, model sources are
        hidden in browsing, but this can be
        toggled
        in the editor view.</highlight-component>
      <p>A model contains all metadata parseable from your source files. If you haven't deleted the demo model, it will
        be visible below. (You can reset the demo to restore it).

        Models are automatically parsed on query submission, but also support on-demand validation. Click the 'parse'
        button to parse the model. This will send the model to a backend server to be parsed and typechecked
        and generate metadata for visibility.

        You can click on an editor name to view and edit it. This can be useful to fix parse errors easily.

      </p>

      <model-card :config="demoConfig" />
    </section>

    <section id="data-and-privacy" class="tutorial-section">
      <h2>Data and Privacy</h2>
      <p>The content of a Trilogy IDE (or selected section of code) + defined model source files will be sent to a
        remote server
        to generate SQL. This contains no other identifying information beyond the editor text and associated model
        editor texts sent.</p>
      <p>All other operations will be between your local machine and services you control. For example, when querying
        any database
        you have configured, the javascript backend will communicate directly with the database without any intermediate
        3rd party servers.</p>

      <h3>Product Specific</h3>
      <h4>Google</h4>
      <p>For google products (Bigquery, etc), the google-javascript-api is used to authenticate your account directly
        from the web client.</p>

      <h4>Other</h4>
      <p>For other databases that require secrets, the browser credential API (NOT YET IMPLEMENTED) is used to store
        credentials
        locally and prompt before accessing them. These credentials are only sent to the relevant database as part
        of connecting. </p>

    </section>

    <section id="telemetry" class="tutorial-section">
      <h2>Telemetry</h2>
      <p><a href="https://www.goatcounter.com/">GoatCounter</a> is used to collect anonymized statistics about usage.
      </p>
    </section>
  </div>
</template>

<script lang="ts">
import { inject } from 'vue';
import type { EditorStoreType } from '../stores/editorStore';
import type { ConnectionStoreType } from '../stores/connectionStore';
import type { ModelConfigStoreType } from '../stores/modelStore';
import LoadingButton from './LoadingButton.vue';

import HighlightComponent from './HighlightComponent.vue';
import ModelCard from './ModelCard.vue';
import ConnectionList from './ConnectionList.vue';
import setupDemo from '../data/tutorial/demoSetup';

export default {
  name: 'TutorialComponent',
  setup() {
    const editorStore = inject<EditorStoreType>('editorStore');
    const connectionStore = inject<ConnectionStoreType>('connectionStore');
    const modelStore = inject<ModelConfigStoreType>('modelStore');
    const saveEditors = inject<Function>('saveEditors');
    const saveConnections = inject<Function>('saveConnections');
    const saveModels = inject<Function>('saveModels');
    if (!editorStore || !connectionStore || !modelStore || !saveEditors || !saveConnections || !saveModels) {
      throw new Error('Editor store is not provided!');
    }
    return { editorStore, connectionStore, modelStore, saveEditors, saveConnections, saveModels };
  },
  components: {
    LoadingButton,
    ConnectionList,
    ModelCard,
    HighlightComponent,
  },
  computed: {
    demoConfig() {
      return this.modelStore.models['demo-model'];
    }
  },
  methods: {
    setupDemo() {
      setupDemo(this.editorStore, this.connectionStore, this.modelStore, this.saveEditors, this.saveConnections, this.saveModels);
    }
  }
};
</script>

<style scoped>
.sidebar-tutorial-container {
  max-width: 450px;
}

.tutorial-container {
  padding: 1rem;
  color: var(--text-color);
  overflow-y: scroll;
}

.tutorial-section {
  margin-bottom: 2rem;
}
</style>