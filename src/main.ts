import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { createPinia } from 'pinia'
import '@mdi/font/css/materialdesignicons.css';
import "tabulator-tables/dist/css/tabulator.min.css";
if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    console.log('Loading tabulator light mode')
    import("tabulator-tables/dist/css/tabulator_simple.css")
}
else {
    console.log('Loading tabulator dark mode')
    import("tabulator-tables/dist/css/tabulator_midnight.css")
}


const Pinia = createPinia()

const app = createApp(App)
app.use(Pinia)
app.mount('#app')

