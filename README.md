# testrail-cli

Small TestRail CLI for humans and agents.

## Development

```sh
pnpm install
pnpm dev setup        # prompts for URL, email, API key, project (and suite)
pnpm check            # typecheck + build + lint + format:check
```

The API must be on (Administration > Site Settings > API). Create a key under My Settings > API Keys.
The config (`.testrail-cli.json`, mode 600) holds the key; it is gitignored.
