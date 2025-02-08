# MeoCord Framework

**MeoCord** is a lightweight and extensible framework designed for building **Discord bots**. With its modular architecture, support for **TypeScript**, and seamless integration with **Discord.js**, MeoCord simplifies bot development while maintaining flexibility and scalability. It offers essential tools such as **CLI commands**, **built-in decorators**, and centralized logging, while also giving developers the ability to define their **own decorators** to extend and customize functionality.

While still growing, MeoCord provides a solid foundation for developers to create bots tailored for communities, automation, or entertainment.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [CLI Usage](#cli-usage)
- [Application Structure](#application-structure)
    - [Example Structure](#example-structure)
    - [Key Components](#key-components)
- [Development Guide](#development-guide)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Powerful CLI Tools**: Manage, build, and run complex projects with simple commands.
- **Highly Modular**: Features modular design with clear separation of concerns (decorators, core logic, utilities).
- **Custom Decorators**: Extend and simplify application logic with decorators.
- **Built-in Services**: Includes logging, utilities, and theming support.
- **Ideal for APIs and Bots**: MeoCord blends perfectly for applications such as Discord bots, backend APIs, or process-based apps.
- **Webpack and TypeScript Ready**: Modern and future-proof application building.

---

## Installation

To get started, you'll need to install the required dependencies for your project. Begin by adding `discord.js` and
`meocord` to your project using the following command.

### Install with Yarn

```shell
yarn add discord.js meocord
```

This ensures you have the core libraries necessary to build robust Discord applications with MeoCord.

---

## Getting Started

To begin building your application with **MeoCord**, follow these steps:

---

### 1. In the `meocord.config.ts`

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
    1. **Environment Variable Loading**: The `load-env.util` ensures that environment variables from `.env` files are
       loaded before executing the app.
    2. **Import Configuration Interface**: Imports the `MeoCordConfig` interface to enforce type safety on the
       configuration object.
    3. **Application Name**: `appName` defines the name of the bot or application.
    4. **Discord Token**: The `discordToken` property retrieves the bot's token from the environment variables, ensuring
       security and flexibility.
    5. **Custom Webpack Configuration**: Adds an optional function to modify and extend the default Webpack
       configuration, including custom module rules or plugins.
    6. **Return Configuration**: Ensures the final configuration satisfies the `MeoCordConfig` type, guaranteeing that
       all required properties are correctly defined.

---

### 2. In the `main.ts`

The **main entry file** (`main.ts`) is responsible for bootstrapping your MeoCord app and starting its execution. It utilizes the `MeoCordFactory` to initialize the application and provides built-in logging support via the `Logger`.

Below is an example setup for `main.ts`:

```typescript
import App from '@src/app';
import { Logger } from 'meocord/common';
import { MeoCordFactory } from 'meocord/core';

const logger = new Logger();
const app = MeoCordFactory.create(App);

async function bootstrap() {
  logger.log('Starting application');
  await app.start();
  logger.log('Application started');
}

bootstrap().catch((error) =>
  logger.error('Error during startup:', error)
);
```

- **Line-by-Line Explanation**:
    1. **Import Core App Class**:
        - `App` is the decorated base class where controllers and services are registered.
    2. **Initialize Framework**:
        - `MeoCordFactory.create(App)` creates and returns an instance of the app, initialized with registered components.
    3. **Bootstrap Logic**:
        - Logs are emitted during startup, and potential errors during initialization are handled via `catch()`.

---

### 3. Define the `app.ts`

The `app.ts` file is the **heart of your application**, acting as the centralized configuration point for registering all controllers, services, intents, and activities. Each **controller** must be explicitly registered here using the `@MeoCord` decorator.

Below is an example `app.ts`:

```typescript
import { GatewayIntentBits, Partials, ActivityType } from 'discord.js';
import { sample } from 'lodash';
import { MeoCord } from 'meocord/decorator';
import { RabbitMQService } from '@src/common/services/rabbitmq.service';
import { SampleSlashController } from '@src/controllers/slash/sample.slash.controller';
import { SampleSelectMenuController } from '@src/controllers/select-menu/sample.select-menu.controller';
import { SampleButtonController } from '@src/controllers/button/sample.button.controller';
import { SampleMessageController } from '@src/controllers/message/sample.message.controller';
import { SampleReactionController } from '@src/controllers/reaction/sample.reaction.controller';

@MeoCord({
  controllers: [
    // Slash Commands
    SampleSlashController,
    // Select Menu
    SampleSelectMenuController,
    // Buttons
    SampleButtonController,
    // Message
    SampleMessageController,
    // Reactions
    SampleReactionController,
  ],
  clientOptions: {
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Reaction],
  },
  activities: [
    {
      name: `${sample(['Genshin', 'ZZZ'])} with Romeo`,
      type: ActivityType.Playing,
      url: 'https://discord.gg/chocotao',
    },
  ],
  services: [RabbitMQService],
})
export default class App {}
```

- **Key Responsibilities of `app.ts`**:

    1. **Register Controllers**  
       Add all your logic handlers (such as commands, event processors, or other bot logic) to the `controllers` array.
        - Each controller **must** use the `@Controller` decorator to ensure they are properly recognized and registered
          by the framework.
        - Controllers must be explicitly imported and defined here for central management.

    2. **Define Client Options**  
       Configure Discord client **intents** and **partials** within the `clientOptions` property.
        - **Intents**: Control what events the bot listens to.
        - **Partials**: Allow access to incomplete data structures from Discord, ensuring a flexible and efficient
          event-processing setup.

    3. **Register Services**  
       Use the `services` array to define application-wide services (such as `RabbitMQService`).
        - These are reusable utilities or dependencies that serve as a core part of your application's functionality and
          can be injected wherever needed.

    4. **Bot Activities**  
       Define your bot's presence or dynamic status using the `activities` property.
        - This enhances the user experience by showing real-time activities, such as the bot "*playing a game*" or
          performing actions for added engagement.

---

### 3. Run the Application

Use the CLI to start your application.

- **Development Mode**:
  Run in development mode:
```shell script
meocord start --dev
```

- **Production Mode**:
  Run in production mode:
```shell script
meocord start --prod
```

---

## CLI Usage
### Overview
The **MeoCord CLI** is designed to help you manage, build, and run your application seamlessly. It provides essential commands and options to streamline your workflow.

#### Viewing All Commands and Options
To ensure you see the most accurate and complete list of commands and options, always refer to the help menu by running:

```shell
meocord --help
```

Below is an example of the help display output:

```shell
❯ meocord --help
meocord [options] [command]
CLI for managing the MeoCord application

Available Options:
┌───────────────┬───────────────────────────┐
│ Option        │ Description               │
├───────────────┼───────────────────────────┤
│ -V, --version │ output the version number │
└───────────────┴───────────────────────────┘

Available Commands:
┌──────────┬───────┬───────────────────────┐
│ Command  │ Alias │ Description           │
├──────────┼───────┼───────────────────────┤
│ build    │ —     │ Build the application │
├──────────┼───────┼───────────────────────┤
│ start    │ —     │ Start the application │
├──────────┼───────┼───────────────────────┤
│ generate │ g     │ Generate components   │
└──────────┴───────┴───────────────────────┘
```

### Key Commands Overview
The following section provides details for frequently used commands, but note that **additional commands** may be available by running `meocord --help`.

#### `meocord build`
Builds the application in **production** or **development** mode.

**Usage:**
```shell
meocord build --prod       # Build for production
meocord build --dev        # Build for development
```

#### `meocord start`
Starts the application with options for either a **production** or **development** environment. The application can also build automatically before starting.

**Usage:**
```shell
meocord start --prod          # Start in production mode (will always fresh build)
meocord start --dev           # Start in development mode (will always fresh build)
```

#### `meocord generate` (Alias: `meocord g`)
Scaffolds application components such as controllers, services, and other elements.

**Usage:**
```shell
meocord generate <type> <name>
```

**Example:**
```shell
meocord g controller user
```
This command will generate a `user` controller.

---

For detailed usage of any particular command, append the `--help` flag to it. For instance:
```shell
meocord build --help
```

This will provide command-specific help and options.

---

## Application Structure

When using MeoCord, the expected project structure is as follows:

### Example Structure
```
.
├── .gitattributes
├── .gitignore
├── .prettierrc.cjs
├── .yarnrc.yml
├── README.md
├── compose.yaml
├── eslint.config.mjs
├── meocord.config.ts
├── package.json
├── src
│   ├── app.ts
│   ├── assets
│   │   ├── font
│   │   ├── gif
│   │   └── png
│   ├── common
│   │   ├── constants
│   │   ├── json
│   │   ├── services
│   │   ├── types
│   │   ├── utils
│   ├── controllers
│   │   ├── button
│   │   ├── context-menu
│   │   ├── message
│   │   ├── modal-submit
│   │   ├── reaction
│   │   ├── select-menu
│   │   └── slash
│   ├── declarations
│   │   ├── assets.d.ts
│   ├── guards
│   │   └── rate-limiter.guard.ts
│   ├── http-services
│   │   └── game.http-service.ts
│   ├── main.ts
│   └── services
│       ├── ping.service.ts
├── tsconfig.json
└── yarn.lock
```

This structure ensures clear separation of concerns and scalable project architecture.

---

### Key Components

1. **Entry Point** (`src/main.ts`):
    - The main application logic, where you initialize and run the app.

2. **Modules** (`src/app.module.ts`):
    - Manage organization with modular logic, enabling better code reuse and maintainability.

3. **Controllers** (`src/controllers`):
    - Build feature-specific logic (e.g., context menus, message handling in bots).

4. **Services** (`src/services`):
    - Core business logic and reusable service definitions.

5. **Guards** (`src/guards`):
    - Middleware-like services for pre-execution logic (e.g., rate-limiting, authorization).

6. **Assets** (`src/assets`):
    - Fonts, images, and other static files for your application.

---

## Development Guide

### Prerequisites

- **Node.js**: Ensure you have version **22.x** or higher, as it’s the current LTS release.
- **TypeScript**: Version **5.x** or above is required for compatibility with modern features.
- **Yarn**: Strongly recommended for managing dependencies and smooth builds.

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

## Contributing

Contributions are welcome! If you'd like to contribute to MeoCord, follow these steps:

1. Fork the repository.
2. Create a feature branch:
```textmate
git checkout -b feature/my-new-feature
```
3. Commit your changes with a descriptive message:
```textmate
git commit -m "Add feature: My new feature"
```
4. Push to your branch:
```textmate
git push origin feature/my-new-feature
```
5. Open a Pull Request.

---

## License

**MeoCord Framework** is licensed under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.txt).

**Key conditions:**
- You can freely use, modify, and distribute the framework under the terms of GPL v3.
- If you distribute derivatives of this software, the source code must also remain freely available under the same GPL v3 terms.

Copying, modification, and redistribution of this software are welcome, but this program comes with **NO WARRANTY**.

For full details about the license, consult the [LICENSE](./LICENSE) file included in the repository.
