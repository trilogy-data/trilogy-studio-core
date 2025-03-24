import { ref, provide } from 'vue';
import { pushHashToUrl, getDefaultValueFromHash } from '../stores/urlStore';

export default function useScreenNavigation() {
    const activeScreen = ref(getDefaultValueFromHash('screen', '') || '');
    const activeEditor = ref(getDefaultValueFromHash('editor', '') || '');
    const mobileMenuOpen = ref(false);
    const setActiveScreen = (screen: string) => {

        pushHashToUrl('screen', screen);
        activeScreen.value = screen;
        if (['community-models', 'welcome', 'profile', 'settings'].includes(screen)) {
            mobileMenuOpen.value = false
          }
    }
    
    const setActiveEditor = (editor: string) => {
        pushHashToUrl('editor', editor);
        activeEditor.value = editor;
        mobileMenuOpen.value = false
    }


    // Provide for deeper component access
    provide('setActiveScreen', setActiveScreen);
    provide ('setActiveEditor', setActiveEditor);
    return {
        activeScreen,
        activeEditor,
        setActiveScreen,
        setActiveEditor,
        mobileMenuOpen,
    }
}