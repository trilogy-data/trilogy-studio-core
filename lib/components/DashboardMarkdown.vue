<template>
    <div class="markdown-content">
      <div class="rendered-markdown" v-html="renderedMarkdown"></div>
    </div>
  </template>
  
  <script lang="ts">
  import { h, computed, defineComponent, markRaw } from 'vue';
  
  // Basic markdown renderer
  function renderMarkdown(text: string): string {
    if (!text) return '';
   
    // Process headers
    let html = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
   
    // Process lists
    html = html.replace(/^\* (.*$)/gim, '<ul><li>$1</li></ul>');
    html = html.replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>');
   
    // Process bold and italic
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');
   
    // Process links
    html = html.replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2">$1</a>');
   
    // Process paragraphs
    html = html.replace(/^\s*$/gm, '</p><p>');
    html = '<p>' + html + '</p>';
    html = html.replace(/<\/p><p><\/p><p>/g, '</p><p>');
   
    return html;
  }
  
  export default defineComponent({
    name: 'MarkdownComponent',
    props: {
      itemId: {
        type: String,
        required: true
      },
      getItemData: {
        type: Function,
        required: true,
        default: () => ({ type: 'MARKDOWN', content: '' })
      },
      setItemData: {
        type: Function,
        required: true,
        default: () => ({ type: 'MARKDOWN', content: '' })
      }
    },
    setup(props) {
      const markdown = computed(() => {
        return props.getItemData(props.itemId).content;
      });
      
      const renderedMarkdown = computed(() => {
        return renderMarkdown(markdown.value);
      });
      
      return { 
        markdown,
        renderedMarkdown
      };
    }
  });
  </script>
  
  <style scoped>
  
/* Markdown Component Styles */
.markdown-content {
  height: 100%;
  padding: 15px;
  overflow: auto;
}

.rendered-markdown {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.5;
}

.rendered-markdown h1 {
  font-size: 1.8em;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.2em;
}

.rendered-markdown h2 {
  font-size: 1.5em;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
}

.rendered-markdown h3 {
  font-size: 1.2em;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
}

.rendered-markdown p {
  margin-top: 0.5em;
  margin-bottom: 0.5em;
}

.rendered-markdown ul {
  margin-top: 0.5em;
  margin-bottom: 0.5em;
  padding-left: 2em;
}

.rendered-markdown a {
  color: #2196f3;
  text-decoration: none;
}

.rendered-markdown a:hover {
  text-decoration: underline;
}
  </style>