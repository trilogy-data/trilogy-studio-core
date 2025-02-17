import { Buffer } from 'buffer';

window.Buffer = Buffer;
// polyfill for SQL Server Driver
// @ts-ignore
Error.captureStackTrace = (targetObject: object, constructorOpt?: Function) => { };
import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { createPinia } from 'pinia'
import '@mdi/font/css/materialdesignicons.css';
import "tabulator-tables/dist/css/tabulator.min.css";
if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    import("tabulator-tables/dist/css/tabulator_simple.css")
}
else {
    import("tabulator-tables/dist/css/tabulator_midnight.css")
}


const Pinia = createPinia()

const app = createApp(App)
app.use(Pinia)

app.mount('#app')

