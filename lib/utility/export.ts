// import html2pdf from 'html2pdf.js';

// export function exportComponentToPDF(elementId, fileName = 'export.pdf', options = {}) {
//   // Get the component element by ID
//   const element = document.getElementById(elementId);

//   if (!element) {
//     console.error(`Element with id "${elementId}" not found`);
//     return;
//   }

//   // Default options
//   const defaultOptions = {
//     margin: [10, 10, 10, 10],
//     filename: fileName,
//     image: { type: 'jpeg', quality: 0.98 },
//     html2canvas: { scale: 2, useCORS: true },
//     jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
//   };

//   // Merge default options with user options
//   const mergedOptions = { ...defaultOptions, ...options };

//   // Generate and download the PDF
//   return html2pdf()
//     .set(mergedOptions)
//     .from(element)
//     .save();
// }
