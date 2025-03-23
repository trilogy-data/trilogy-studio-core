import { ref, provide } from 'vue';
import { pushHashToUrl, getDefaultValueFromHash } from '../stores/urlStore';

export default function useScreenNavigation() {
    const activeScreen = ref(getDefaultValueFromHash('screen', ''));
    const activeEditor = ref(getDefaultValueFromHash('editor', ''));
    const setActiveScreen = (screen: string) => {
        console.log('push')
        pushHashToUrl('screen', screen);
        activeScreen.value = screen;
    }
    
    const setActiveEditor = (editor: string) => {
        pushHashToUrl('editor', editor);
        activeEditor.value = editor;
    }


    // Provide for deeper component access
    provide('setActiveScreen', setActiveScreen);
    provide ('setActiveEditor', setActiveEditor);
    return {
        activeScreen,
        activeEditor,
        setActiveScreen,
        setActiveEditor,
    }
}