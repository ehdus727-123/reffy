import vue from '@vitejs/plugin-vue';
import {defineConfig} from 'vite';
import string from 'vite-plugin-string';
export default defineConfig({
    publicDir: false,
    plugins: [vue(), string({include: ['**/*.vert', '**/*.frag', '**/*.obj'], compress: false})],
    define: {'process.env.NODE_ENV': '"production"'},
    build: {
        outDir: 'dist-lib', emptyOutDir: true, sourcemap: false, cssCodeSplit: false,
        lib: {entry: 'src/rpose.ts', name: 'RPose', formats: ['iife'], fileName: () => 'pose-engine.js'},
        commonjsOptions: {transformMixedEsModules: true}, rollupOptions: {output: {inlineDynamicImports: true}},
    },
});
