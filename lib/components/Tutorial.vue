<template>
  <div class="tutorial-container">
    <section id="navigation" class="tutorial-section">
      <h2>Navigation</h2>
      <p>Trilogy Studio uses a left hand navigation bar, a sidebar with context, and main pane (which may be split) to
        present information.
        The sidebar is further split into sections; the first icons change the sidebar for the query editor, while the
        next section configures
        entirely new main screen experiences. Configuration/profile are accessible at the bottom.</p>

    </section>
    <section id="demo" class="tutorial-section">
      <h2>Demo</h2>
      <p>The demo will set up a duckdb connection using publically available parquet files as model inputs. It's a great
        way to dive into querying right away.

        If this is your first visit, then the demo will be set up automatically.

        Try the demo_1 and demo_2 queries to see how the model can be used to generate SQL, and then look at the source
        model files to see inputs.

        Clicking the reset button below will recreate the 'demo-connection' and all associated editors to default state.
        Take care as it will revert any changes you have made. </p>
      <loading-button :action="setupDemo">Reset Demo</loading-button>
    </section>

    <section id="querying" class="tutorial-section">
      <h2>Querying</h2>
      <p>The primary function of trilogy studio is letting you run queries in Trilogy or SQL against connections
        representing backend databases.</p>
      <p>When creating an editor, you will select a type. Trilogy editors run Trilogy code; SQL editors run SQL. An
        editor must be associated with a connection and may be associated with a model.</p>
      <p>When running trilogy queries, your command will first go to a backend server to be parsed/typechecked, then the
        output SQL will be returned to the editor to execute as a normal SQL query.</p>
    </section>

    <section id="connections" class="tutorial-section">
      <h2>Connections</h2>
      <p>Editors must be associated with a connection. A connection represents a particular underlying backend database
        resource. Many IDEs can share one connection, but only a single query can be executed on a connection at a
        single point in time. Connections are also associated with model, which enables configuration of additional
        editors
        as semantic sources.
      </p>
      You can view current connections below. Edit the model associated with a connection by clicking the button next to
      it.

      This connection view is accessible. through the connections page on the left side.
      <div class='sidebar-tutorial-container'>
        <connection-list />
      </div>
    </section>

    <section id="models" class="tutorial-section">
      <h2>Models</h2>
      <p>Models are the Trilogy semantic layer. When you run a Trilogy command in a connection with a model associated,
        it
        will be able to import all included files and reference them.</p>
    </section>

    <section id="data-and-privacy" class="tutorial-section">
      <h2>Data and Privacy</h2>
      <p>The content of a Trilogy IDE (or selected subset) + defined model source files will be sent to a remote server
        to generate SQL. This contains no other identifying information beyond the editor text and associated model
        editor texts sent.</p>
      <p>All other operations will be between your local machine and services you control. For example, when querying any database
        you have configured, the javascript backend will communicate directly with the database without any intermediate 3rd party servers.</p>

      <h3>Product Specific</h3>
      <h4>Google</h4>
      <p>For google products (Bigquery, etc), we will use the google-javascript-api to authenticate as your account on
        the client side.</p>

      <h4>Other</h4>
      <p>For other databases that require secrets, we will use the browser credential API to store your credentials
        locally and prompt you before accessing them. These credentials are only sent to the relevant database as part of connecting.</p>

    </section>

    <section id="telemetry" class="tutorial-section">
      <h2>Telemetry</h2>
      <p>We use <a href="https://www.goatcounter.com/">GoatCounter</a> to connect anonymized statistics about usage.</p>
    </section>
  </div>
</template>

<script lang="ts">
import { inject } from 'vue';
import type { EditorStoreType } from '../stores/editorStore';
import type { ConnectionStoreType } from '../stores/connectionStore';
import type { ModelConfigStoreType } from '../stores/modelStore';
import { DuckDBConnection } from '../connections';
import Editor from '../editors/editor'
import {EditorTag} from '../editors/editor'
import LoadingButton from './LoadingButton.vue';
import { ModelConfig } from '../models/model';
import ConnectionList from './ConnectionList.vue';
import { CUSTOMER_CONTENT, ORDER_CONTENT, PART_CONTENT, NATION_CONTENT, SUPPLIER_CONTENT, REGION_CONTENT, LINE_ITEM_CONTENT } from '../data/tutorial/queries'
import { QUERY_LINE_ITEM, QUERY_JOIN } from '../data/tutorial/example_queries';
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
    ConnectionList
  },
  methods: {
    setupDemo() {
      let connName = 'demo-connection';
      let modelName = 'demo-model';
      let connection = new DuckDBConnection(connName, modelName);
      let x = this.connectionStore.addConnection(connection);
      console.log(x)
      //CUSTOMER_CONTENT, ORDER_CONTENT, PART_CONTENT, NATION_CONTENT, SUPPLIER_CONTENT, REGION_CONTENT
      let customer = new Editor({ name: 'customer', type: 'trilogy', connection: connName, storage: 'local', contents: CUSTOMER_CONTENT, tags: [EditorTag.SOURCE] });
      this.editorStore.addEditor(customer);
      let order = new Editor({ name: 'order', type: 'trilogy', connection: connName, storage: 'local', contents: ORDER_CONTENT, tags: [EditorTag.SOURCE] });
      this.editorStore.addEditor(order);
      let part = new Editor({ name: 'part', type: 'trilogy', connection: connName, storage: 'local', contents: PART_CONTENT, tags: [EditorTag.SOURCE] });
      this.editorStore.addEditor(part);
      let nation = new Editor({ name: 'nation', type: 'trilogy', connection: connName, storage: 'local', contents: NATION_CONTENT, tags: [EditorTag.SOURCE] });
      this.editorStore.addEditor(nation);
      let supplier = new Editor({ name: 'supplier', type: 'trilogy', connection: connName, storage: 'local', contents: SUPPLIER_CONTENT, tags: [EditorTag.SOURCE] });
      this.editorStore.addEditor(supplier);
      let region = new Editor({ name: 'region', type: 'trilogy', connection: connName, storage: 'local', contents: REGION_CONTENT, tags: [EditorTag.SOURCE] });
      this.editorStore.addEditor(region);
      let lineItem = new Editor({ name: 'lineitem', type: 'trilogy', connection: connName, storage: 'local', contents: LINE_ITEM_CONTENT, tags: [EditorTag.SOURCE] });
      this.editorStore.addEditor(lineItem);

      // add example queries
      let query = new Editor({ name: 'example_query_1', type: 'trilogy', connection: connName, storage: 'local', contents: QUERY_LINE_ITEM });
      this.editorStore.addEditor(query);

      query = new Editor({ name: 'example_query_2', type: 'trilogy', connection: connName, storage: 'local', contents: QUERY_JOIN });
      this.editorStore.addEditor(query);

      let mc = new ModelConfig({
        name: modelName,
        sources: [{ alias: 'customer', editor: 'customer' }, { alias: 'order', editor: 'order' },
        { alias: 'part', editor: 'part' }, { alias: 'nation', editor: 'nation' }, { alias: 'supplier', editor: 'supplier' },
        { alias: 'region', editor: 'region' }, { alias: 'lineitem', editor: 'lineitem' }
        ],
        storage: 'local', parseResults: null
      });
      this.modelStore.addModelConfig(mc)

      this.saveEditors(Object.values(this.editorStore.editors));
      this.saveConnections(Object.values(this.connectionStore.connections));
      this.saveModels(Object.values(this.modelStore.models));
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