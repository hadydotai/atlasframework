import { defineConfig } from "vite";

export default defineConfig({
	build: {
		target: "es2022",
		minify: false,
		sourcemap: true,
		lib: {
			entry: {
				index: "src/index.ts",
				"jsx-runtime": "src/jsx-runtime.ts",
				"jsx-dev-runtime": "src/jsx-dev-runtime.ts",
				"providers/anthropic": "src/providers/anthropic.ts",
			},
			formats: ["es"],
			fileName: (_format, entryName) => `${entryName}.js`,
		},
	},
});
