# MeoCord Framework

**MeoCord** is a lightweight and extensible framework designed for building **Discord bots**. With its modular architecture, support for **TypeScript**, and seamless integration with **Discord.js**, MeoCord simplifies bot development with a focus on flexibility, scalability, and modularity. It offers essential tools such as **CLI commands**, **built-in decorators**, and centralized logging, while also giving developers the ability to define their **own decorators** to extend and customize functionality.

While still growing, MeoCord provides a solid foundation for developers to create bots tailored for communities, automation, or entertainment.

---

## Table of Contents

- [Features](#features)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
    - [Example Structure](#example-structure)
    - [Key Components](#key-components)
- [Configuration](#configuration)
- [Getting Started](#getting-started)
- [CLI Usage](#cli-usage)
- [Development Guide](#development-guide)
- [Deployment Guide](#deployment-guide)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Powerful CLI Tools**  
  Easily manage, build, and run projects using an intuitive CLI. Simplify tasks such as scaffolding components, building
  applications, and starting bots in development/production modes.

- **Modular Design**  
  Embrace modularity by organizing application logic into distinct components like controllers and services. This
  approach enhances scalability, improves maintainability, and simplifies future development.

- **Built-in Decorators**  
  Simplify and extend bot behavior through a robust decorator system. Leverage built-in decorators for streamlined
  functionality.

- **Specialized Services**  
  Register specialized services using the `@MeoCord` decorator. For example, add a RabbitMQ service to listen for events
  and trigger actions, such as sending Discord messages. This promotes modularity, flexibility, and seamless integration
  of custom services.

- **Seamless Discord.js Integration**  
  Built on top of Discord.js to provide full support for the Discord API, with added features like activity management,
  intents, partials, and custom client options.

- **TypeScript-First Approach**  
  Designed with TypeScript in mind, offering strict type safety, interfaces, and decorators to empower modern
  development workflows.

- **Extensible Webpack Integration**  
  Easily customize your build process using an exposed Webpack configuration hook. Add rules, plugins, or modify setups
  to match your project's requirements.

- **Dynamic Activity Support**  
  Manage bot presence dynamically, such as setting activities (e.g., "Playing X with Y") or linking bot status to
  real-time events.

---

## Getting Started

To begin building your application with **MeoCord**, follow these steps:

---

### 1. Create a fresh MeoCord Application

Use the CLI to generate your application.

```shell script
npx meocord create <your-app-name>
```

---

### 2. Configure `meocord.config.ts`

Edit `meocord.config.ts` to add required discord token:

```typescript
import { MeoCordConfig } from 'meocord/interface'

export default {
  appName: 'DJS ChuTao',
  discordToken: '<add-your-token-here>',
} satisfies MeoCordConfig
```

---

### 3. Run the Application

Use the CLI to start your application.

- **Development Mode**:
  Run in development mode:
```shell script
yarn start:dev
```

- **Production Mode**:
  Run in production mode with fresh production build:
```shell script
yarn start:prod --build   # use arg `--build` if not built yet or use `yarn build:prod` first
```

---

## Project Structure

When using MeoCord, the expected project structure is as follows:

### Example Structure
```
.
.
├── .gitignore
├── .prettierrc.mjs
├── .yarnrc.yml
├── eslint.config.mjs
├── meocord.config.ts
├── package.json
├── src
│   ├── app.ts
│   ├── controllers
│   │   ├── button
│   │   ├── context-menu
│   │   ├── message
│   │   ├── modal-submit
│   │   ├── reaction
│   │   ├── select-menu
│   │   └── slash
│   ├── guards
│   │   └── rate-limit.guard.ts
│   ├── main.ts
│   └── services
│       └── sample.service.ts
├── tsconfig.json
└── yarn.lock
```

This structure ensures clear separation of concerns and scalable project architecture.

---

### Key Components

1. **Entry Point** (`src/main.ts`):
    - The main application logic, where you initialize and run the app.

2. **Application Configuration** (`src/app.ts`):
    - Acts as the central configuration point, where controllers, services, client options, and other metadata are defined.
    - Ties all modular components (controllers, specialized services, activities, etc.) together to define the core structure of the app.

3. **Controllers** (`src/controllers`):
    - Build feature-specific logic (e.g., context menus, message handling in bots).

4. **Services** (`src/services`):
    - Core business logic and reusable service definitions.

5. **Guards** (`src/guards`):
    - Middleware-like services for pre-execution logic (e.g., rate-limiting, authorization).

6. **Assets** (`src/assets`):
    - Fonts, images, and other static files for your application.

---

## Configuration

### Customize the ESLint Configuration

If needed, you can extend or modify the default configuration to fit your project's requirements:

```javascript
import unusedImports from 'eslint-plugin-unused-imports';
import meocordEslint, { typescriptConfig } from 'meocord/eslint';

const customConfig = {
  ...typescriptConfig,
  plugins: {
    ...typescriptConfig.plugins,
    'unused-imports': unusedImports,
  },
  rules: {
    ...typescriptConfig.rules,
    'unused-imports/no-unused-imports': 'error', // Ensure no unused imports
    'unused-imports/no-unused-vars': [
      'error',
      {
        vars: 'all',
        varsIgnorePattern: '^_', // Allow variables starting with `_`
        args: 'after-used',
        argsIgnorePattern: '^_',
      },
    ],
    // Add or override additional rules here
  },
};

export default [...meocordEslint, customConfig];
```

---

### Customize the `meocord.config.ts`

The **configuration file** (`meocord.config.ts`) is responsible for defining the application-wide settings. It provides essential configurations such as the app name and Discord token.

Below is an example setup for `meocord.config.ts`:

```typescript
import '@src/common/utils/load-env.util'
import { MeoCordConfig } from 'meocord/interface'

export default {
  appName: 'DJS ChuTao',
  discordToken: process.env.TOKEN!,
  webpack: config => {
    config.module.rules.push({
      // Add your custom webpack rule
    })

    return config
  }
} satisfies MeoCordConfig
```

- **Line-by-Line Explanation**:
    1. **Environment Variable Loading**:  
       The `load-env.util` ensures that environment variables from `.env` files are loaded before executing the app. *(This utility internally uses the `dotenv` package to load variables from `.env` files. For example, a `.env`
       file containing `TOKEN=your-discord-bot-token` makes `process.env.TOKEN` accessible in the application).*
       **Example of `load-env.util`:**
         ```typescript
         import { config } from 'dotenv';
         import path from 'path';
    
         const getEnvFilePath = (): string => {
           switch (process.env.NODE_ENV) {
             case 'production':
               return '.env.prod';
             default:
               return '.env.dev';
           }
         };
    
         const envFilePath = path.resolve(process.cwd(), getEnvFilePath());
    
         config({
           path: envFilePath,
           encoding: 'utf8',
         });
         ```

    2. **Import Configuration Interface**:  
       Imports the `MeoCordConfig` interface to enforce type safety on the configuration object.

    3. **Application Name**:  
       The `appName` defines the name of the bot or application.

    4. **Discord Token**:  
       The `discordToken` property retrieves the bot's token from the environment variables, ensuring security and
       flexibility.

    5. **Custom Webpack Configuration**:  
       Adds an optional function to modify and extend the default Webpack configuration, including custom module rules
       or plugins.

    6. **Return Configuration**:  
       Ensures the final configuration satisfies the `MeoCordConfig` type, guaranteeing that all required properties are
       correctly defined.

---

## CLI Usage
### Overview
The **MeoCord CLI** is designed to help you manage, build, and run your application seamlessly. It provides essential commands and options to streamline your workflow.

#### Viewing All Commands and Options
To ensure you see the most accurate and complete list of commands and options, always refer to the help menu by running:

```shell
yarn meocord --help
```

Below is an example of the help display output:

```textmate
❯ yarn meocord --help
MeoCord Copyright (C) 2025  Ukasyah Rahmatullah Zada
    This program comes with ABSOLUTELY NO WARRANTY; for details type `meocord show -w'.
    This is free software, and you are welcome to redistribute it
    under certain conditions; type `meocord show -c' for details.

meocord [options] [command]

CLI for managing the MeoCord application

Available Options:
┌───────────────┬───────────────────────────┐
│ Option        │ Description               │
├───────────────┼───────────────────────────┤
│ -V, --version │ output the version number │
└───────────────┴───────────────────────────┘

Available Commands:
┌──────────┬───────┬──────────────────────────────────┐
│ Command  │ Alias │ Description                      │
├──────────┼───────┼──────────────────────────────────┤
│ show     │ —     │ Display information              │
├──────────┼───────┼──────────────────────────────────┤
│ create   │ —     │ Create a new MeoCord application │
├──────────┼───────┼──────────────────────────────────┤
│ build    │ —     │ Build the application            │
├──────────┼───────┼──────────────────────────────────┤
│ start    │ —     │ Start the application            │
├──────────┼───────┼──────────────────────────────────┤
│ generate │ g     │ Generate components              │
└──────────┴───────┴──────────────────────────────────┘
```

### Key Commands Overview
The following section provides details for frequently used commands, but note that **additional commands** may be available by running `meocord --help`.

#### `meocord build`
Builds the application in **production** or **development** mode.

**Usage:**
```shell
yarn meocord build --prod       # Build for production
yarn meocord build --dev        # Build for development
```

#### `meocord start`
Starts the application with options for either a **production** or **development** environment. The application can also build automatically before starting.

**Usage:**
```shell
yarn meocord start --build --prod          # Start in production mode with fresh production build
yarn meocord start --dev                   # Start in development mode (will always fresh build)
```

#### `meocord generate` (Alias: `meocord g`)
Scaffolds application components such as controllers, services, and other elements.

**Usage:**
```text
yarn meocord generate|g [options] [command]
```

**Example:**
```shell
yarn meocord g co slash "user"
```
This command will generate a `user` slash controller.

---

For detailed usage of any particular command, append the `--help` flag to it. For instance:
```shell
yarn meocord g --help
```

This will provide command-specific help and options.

---

## Development Guide

### Prerequisites

- **Node.js**: Ensure you have version **22.x** or higher, as it’s the current LTS release.
- **TypeScript**: Version **5.x** or above is required for compatibility with modern features.
- **Yarn**: Version stable (`corepack enable && yarn set version stable`) Strongly recommended for managing dependencies and smooth builds.

### Running Your Application

#### Development Mode

Run the application in development mode with live-reload for a seamless coding experience:

```shell
yarn meocord start --dev
```

#### Building for Production

Generate an optimized and compiled production build with:

```shell
yarn meocord build --prod
```

Once built, you can deploy or run the application efficiently.

---

## Deployment Guide

Install all necessary dependencies, including development dependencies, before building:

```shell
yarn install --immutable
```

Generate an optimized and compiled production build:

```shell
yarn meocord build --prod
```

Clean up and focus on production-only dependencies:

```shell
yarn workspaces focus --production
```

Ensure the following essential files and folders are prepared for deployment on the server:

```text
.
├── dist
├── node_modules (production dependencies only)
├── .env (if applicable, ensure it contains necessary variables)
├── .yarn (optional: exclude cache if not required)
├── .yarnrc.yml
├── package.json
└── yarn.lock
```

Start the application in production mode on the server:

```shell
yarn meocord start --prod
```

---

## Contributing

We welcome contributions to improve **MeoCord**. Here's how you can get started:

1. **Fork the Repository**:  
   Click the "Fork" button in the top-right corner of the repository page to create your copy of the project.

2. **Create a Feature Branch**:  
   Use the following command to create a branch for your changes:

   ```textmate
   git checkout -b feature/your-feature-name
   ```

3. **Make Meaningful Commits**:  
   Commit your changes with clear, descriptive, and concise messages that explain what your changes do:

   ```textmate
   git commit -m "feat: add [brief description of your feature or fix]"
   ```

4. **Push Your Changes**:  
   Push your branch to your forked repository with this command:

   ```textmate
   git push origin feature/your-feature-name
   ```

5. **Open a Pull Request (PR)**:
    - Navigate to the original **MeoCord** repository.
    - Click "Compare & Pull Request."
    - Provide a descriptive title and a detailed description of your changes.

   Be sure to include:
    - The purpose of your changes.
    - Any relevant details or links.
    - Steps to reproduce/test the changes, if applicable.

6. **Engage in Reviews**:  
   Work with maintainers to address any feedback or changes they request.

Thank you for helping make **MeoCord** better!

---

## License

**MeoCord Framework** is licensed under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.txt).

**Key conditions:**
- You can freely use, modify, and distribute the framework under the terms of GPL v3.
- If you distribute derivatives of this software, the source code must also remain freely available under the same GPL v3 terms.

Copying, modification, and redistribution of this software are welcome, but this program comes with **NO WARRANTY**.

For full details about the license, consult the [LICENSE](./LICENSE) file included in the repository.
