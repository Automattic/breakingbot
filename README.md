# Breaking Bot

![Breaking Bot Logo](docs/assets/breakingbot256.png)

Breaking Bot is a chat bot for coordinating responses to "breaking incidents". It is built on RDBMS-backed data flows, a clean business core, and, at present, chat responsiveness through the [Hubot](https://hubot.github.com/) framework.

[Tumblr](https://engineering.tumblr.com) built the bot as `bb8` many moons ago. [WordPress VIP](https://wpvip.com) retuned the bot. And [Automattic](https://automattic.com/about) open sourced it.

## Architecture

Breaking Bot is composed of the following major pieces:

- `data`
  - data structures
  - RDBMS persistence
- `core`
  - [finite state machines](./docs/fsm.md)
  - functions without side effects
- `boundary`
  - Comm Platform
  - [Annoyotron](./docs/annoyotron.md)
  - [Archivist](./docs/archivist.md)
  - [Syntrax](./docs/syntrax.md)
  - Issue Tracker (optional)
  - Report Platform (optional)

We use RDBMS backing because it's great. We use finite state machines in our core to contain the inherent, non-trivial, stateful complexity in incidents. We isolate business logic as much as we can into functions without side effects in the core. And we push our I/O concerns to the boundary layer.

Comm Platform, at present, is entwined with Hubot and Slack specifically. But we likely detangle all that in the long run. Issue Trackers and Report Platforms are simply interfaces. Anything implemented to their requirements will work in those roles.

## Development

### Create a `.env` file

Copy `.env.example` file to `.env`. This file will be read by `docker-compose-yml` and will override the defaults there.

```sh
cp .env.example .env
```

### Create a test Slack workspace

You will need to be an owner of this workspace so that you have the required permissions. A workspace dedicated to bot development is ideal so that you aren't worried about noise or things going wrong.

1. Create a new workspace on [slack.com](https://slack.com).
2. Create a main channel for Breaking Bot in Slack, eg: `#breaking-test`.
3. Copy the channel ID and provide it in your `devConfig` file as `breakingMainRoom`.
4. Optionally, repeat steps 2 and 3 and set a `breakingNotifyRoom` if you would like Breaking Bot to drop important notifications somewhere other than the `breakingMainRoom`.

FYI, the workspace's dashboard is available via **Settings &amp; administration &gt; Workspace settings**.

### Create a Slack app

1. [Create a Slack app](https://api.slack.com/apps) using [this app manifest](./slack-app.manifest).
2. Install the app to your test workspace.
3. Navigate to **Settings -> Basic Information**, generate, and copy an app token with `connections:write` scope in the **App-Level Tokens** section. Provide it to your `.env` file as `SLACK_APP_TOKEN`.
4. Navigate to **Settings -> Install App** and copy the **Bot User OAuth Token**. Provide it to your `.env` file as `SLACK_BOT_TOKEN`. Make sure the app is installed to your workspace in this section too.

### Dev Feedback Loop

Install dependencies:

```sh
npm ci
```

Start the local environment with:

```sh
docker-compose up
```

If your configuration is correct, you will see `INFO` level logging of `Now connected to Slack` when the bot is ready to accept commands in your test Slack instance.

When you make changes to code, the bot will restart automatically (via `ts-watch`). Note that changes to `.env` or `docker-compose.yml` are an exception and will require you to `docker-compose stop` and `start`.

### Debugging

To see all the HTTP requests being made, and crank up logger level with the following environment variables in `.env` and restart `docker-compose`.

```
HUBOT_LOG_LEVEL=debug
NODE_DEBUG=request
```

## Testing

Iterative:

```
npm run test:watch
```

Single run:

```
npm test
```
