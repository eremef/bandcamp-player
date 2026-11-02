import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    plugins: [react()],
    test: {
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        exclude: ['mobile/**/*', 'node_modules/**/*', 'dist/**/*'],
        environment: 'happy-dom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
        alias: {
            '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
            '@renderer': fileURLToPath(new URL('./src/renderer', import.meta.url)),
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
        },
    },
});
