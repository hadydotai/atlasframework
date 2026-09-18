import { defineConfig } from "vite";

export default defineConfig({
	build: {
		target: "es2022",
		minify: false,
		sourcemap: true,
		lib: {
			entry: "src/index.ts",
			formats: ["es"],
			fileName: () => "index.js",
		},
	},
});
