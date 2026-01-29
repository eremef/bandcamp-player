import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        exclude: ['mobile/**/*', 'node_modules/**/*', 'dist/**/*'],
        environment: 'happy-dom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
        alias: {
            '@shared': path.resolve(__dirname, 'src/shared'),
            '@renderer': path.resolve(__dirname, 'src/renderer'),
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
        },
    },
});
