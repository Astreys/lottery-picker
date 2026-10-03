import adapter from '@sveltejs/adapter-netlify';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter()
		})
	],
	test: {
		include: ['tests/unit/**/*.test.ts'],
		environment: 'node',
		coverage: {
			// Components and pages are covered by the Playwright suite in tests/e2e.
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.d.ts', 'src/lib/index.ts']
		},
		environmentOptions: {
			// The analytics test injects the gtag <script>; never actually fetch it.
			happyDOM: {
				settings: {
					disableJavaScriptFileLoading: true,
					handleDisabledFileLoadingAsSuccess: true
				}
			}
		}
	}
});
