import js from '@eslint/js';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	{ languageOptions: { globals: { ...globals.browser, ...globals.node } } },
	{ ignores: ['src/gen/**', 'node_modules/**'] }
);
