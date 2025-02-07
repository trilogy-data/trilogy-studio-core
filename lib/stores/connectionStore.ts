import { defineStore } from 'pinia'
import Connection  from '../connections/base'

const useConnectionStore = defineStore('connections', {
    state: () => ({
        connections: {} as Record<string, Connection>, // Use an object instead of Map
      }),

      actions: {
        addConnection(connection: Connection) {
          this.connections[connection.name] = connection; // Add editor using object notation
        },
        resetConnection(name: string) {
          if (this.connections[name]) {
            return this.connections[name].reset();
          } else {
            throw new Error(`Connection with name "${name}" not found.`);
          }
        }
      },
    });

  export type ConnectionStoreType = ReturnType<typeof useConnectionStore>;
  
  
  export default useConnectionStore;