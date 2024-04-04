# Jira Issue Tracker

## Development

Jira is a royal pain to test. Atlassian actually has [dockerized stuff](https://hub.docker.com/r/atlassian/jira-software) out there, BUT, it requires a painfully intense dev licensing flow just to stand up which makes it impractical. So, a test project in prod instance is the preferred way to test this issue tracker.

1. Create a test project in your Jira instance.
2. Set `JIRA_EMAIL` in `.env` with the email of the Jira account you want to use with the bot.
3. Acquire from within that account, set, `JIRA_API_TOKEN`.
4. Add a `JiraConfig` to your dev `AppConfig`.

## v2 API, v3 API, and ADF -- oh my!

**Jira API v2:**
An older version of Jira's RESTful API that allows developers to interact with Jira's features, like issues and workflows, through standard HTTP methods. This API primarily returns data in JSON format and supports various CRUD operations.

**Jira API v3:**
An updated version of the API that introduces changes such as the Atlassian Document Format (ADF) for text fields and better compliance with data privacy regulations. Technically, still "beta", but clearly the direction moving forward.

**ADF (Atlassian Document Format):**
A JSON-based markup language used to represent complex text formatting and content in Atlassian's products. ADF is intended to offer consistent representation and manipulation of rich text elements across Atlassian applications.

## Integration

We are using v3, sending ADF where required via Markdown -> ProseMirror node -> ADF conversion.
