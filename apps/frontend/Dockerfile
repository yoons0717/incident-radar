# 빌드 컨텍스트는 모노레포 루트(docker-compose.yml 의 build.context: .).
FROM node:20-alpine

RUN corepack enable

WORKDIR /app
COPY . .

# NEXT_PUBLIC_* 은 브라우저 번들에 빌드 타임에 박힌다 — 런타임 env 로는 안 바뀐다.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@incident-radar/frontend...

WORKDIR /app/apps/frontend
EXPOSE 3001

CMD ["pnpm", "start"]
