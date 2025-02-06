import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { createPinia } from 'pinia'

const Pinia = createPinia()

const app = createApp(App)
app.use(Pinia)
app.mount('#app')

