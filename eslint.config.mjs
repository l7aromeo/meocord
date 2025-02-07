import importPlugin from 'eslint-plugin-import';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import eslintJs from '@eslint/js';
import eslintTs from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginPrettier from 'eslint-plugin-prettier';
import unusedImports from 'eslint-plugin-unused-imports';

const tsFiles = ['**/*.ts'];
const jsFiles = ['**/*.js'];

const languageOptions = {
    globals: {
        ...globals.node,
        ...globals.jest,
    },
    ecmaVersion: 2023,
    sourceType: 'module',
    parserOptions: {
        project: './tsconfig.json',
    },
};

const customTypescriptConfig = {
    files: tsFiles,
    plugins: {
        import: importPlugin,
        prettier: eslintPluginPrettier,
        'unused-imports': unusedImports,
    },
    languageOptions: {
        ...languageOptions,
        parser: tsParser,
    },
    settings: {
        'import/parsers': {
            '@typescript-eslint/parser': ['.ts'],
        },
        'import/resolver': {
            typescript: {
                alwaysTryTypes: true,
                project: './tsconfig.json',
            },
        },
    },
    rules: {
        ...importPlugin.configs.typescript.rules,
        'prettier/prettier': 'error',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/no-var-requires': 'warn',
        'unused-imports/no-unused-imports': 'error',
        '@typescript-eslint/no-unused-expressions': 'off',
        '@typescript-eslint/no-unused-vars': [
            'error',
            {
                ignoreRestSiblings: true,
                args: 'none',
            },
        ],
    },
};

const customJavaScriptConfig = {
    files: jsFiles,
    plugins: {
        import: importPlugin,
        prettier: eslintPluginPrettier,
        'unused-imports': unusedImports,
    },
    languageOptions,
    rules: {
        ...importPlugin.configs.recommended.rules,
        'prettier/prettier': 'error',
        'unused-imports/no-unused-imports': 'error',
        'no-var': 'error',
        'prefer-const': 'warn',
        'no-unused-vars': [
            'error',
            {
                ignoreRestSiblings: true,
                args: 'none',
            },
        ],
    },
};

const recommendedTypeScriptConfigs = [
    ...eslintTs.configs.recommended.map((config) => ({
        ...config,
        files: tsFiles,
    })),
    ...eslintTs.configs.stylistic.map((config) => ({
        ...config,
        files: tsFiles,
    })),
];

export default [
    { ignores: ['docs/*', 'build/*', 'lib/*', 'dist/*', 'out/*'] },
    eslintJs.configs.recommended,
    ...recommendedTypeScriptConfigs,
    eslintConfigPrettier,
    customTypescriptConfig,
    customJavaScriptConfig,
];
