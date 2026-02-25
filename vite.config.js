import { defineConfig } from 'vite';

export default defineConfig({
    base: './', // Necessário para o GitHub Pages funcionar corretamente
    build: {
        outDir: 'dist',
    }
});
