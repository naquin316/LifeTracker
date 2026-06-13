# Pin a Debian base directly (HA's default add-on base is Alpine/apk; build.yaml
# build_from is deprecated). Debian/glibc keeps the better-sqlite3 native build
# simple. HA passes a BUILD_FROM build-arg that we intentionally ignore.
FROM node:22-bookworm-slim

# Tools: git (fetch app), jq (read add-on options), build-essential + python3
# (compile better-sqlite3 native module).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     git jq python3 build-essential ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The app source lives at the repo root; this thin add-on builds it. Pin the ref
# to rebuild on demand by bumping config.yaml version.
ARG APP_REPO=https://github.com/naquin316/LifeTracker
ARG APP_REF=main
RUN git clone --depth 1 --branch "${APP_REF}" "${APP_REPO}" . \
  && npm ci \
  && npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force

COPY run.sh /run.sh
RUN chmod +x /run.sh

EXPOSE 3939
CMD [ "/run.sh" ]
