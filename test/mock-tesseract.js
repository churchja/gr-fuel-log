window.Tesseract = { createWorker: async () => ({ recognize: async () => ({ data: { text: window.__ocrText || "" } }), terminate: async () => {} }) };
