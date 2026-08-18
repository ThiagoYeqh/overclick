# Deploying the cloud instance

This directory holds what a hosted OverClick instance needs, kept apart from the
quickstart compose file at the repo root so a server can run this one without
touching anything else already on the machine: its own project name, network,
volume and port.

## First deploy

```bash
git clone https://github.com/ustoppble/overclick && cd overclick
cp deploy/.env.example deploy/.env       # then fill it in, see below
docker compose -p overclick -f deploy/docker-compose.cloud.yml up -d --build
```

`deploy/.env` needs two values and nothing else:

```
POSTGRES_PASSWORD=<a long random string>
AUTH_SECRET=<32+ random characters>
OVERCLICK_PORT=3100                      # optional, the loopback port the proxy talks to
```

Generate both with `openssl rand -hex 32`. The app listens on `127.0.0.1:3100`
by design: nothing reaches it except through the reverse proxy.

## Reverse proxy

Caddy, the shortest path to HTTPS:

```
cloud.overclock.sh {
    reverse_proxy 127.0.0.1:3100
}
```

Nginx, if the host already runs one:

```nginx
server {
    server_name cloud.overclock.sh;
    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;          # MCP streams over HTTP, do not cut it short
    }
}
```

The long read timeout matters: agents hold streaming HTTP calls to `/mcp` while
they work.

## Deploying again

```bash
./deploy/deploy.sh
```

That is `git pull`, rebuild, restart, and a health check, in one command. The
data volume is never touched, so cards, tokens and settings survive every deploy.

## Backups

The whole instance is one Postgres volume:

```bash
docker exec overclick-postgres-1 pg_dump -U overclick overclick | gzip > overclick-$(date +%F).sql.gz
```

Put that in a cron and the instance is disposable, which is the point.
