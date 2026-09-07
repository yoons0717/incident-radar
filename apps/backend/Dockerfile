# 빌드 컨텍스트는 모노레포 루트(docker-compose.yml 의 build.context: .).
FROM node:20-alpine

RUN corepack enable

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@incident-radar/backend...

WORKDIR /app/apps/backend
EXPOSE 3000

# 컨테이너가 뜰 때마다 스키마를 최신으로 맞추고 앱을 기동한다.
CMD ["sh", "-c", "pnpm migration:run && node dist/main.js"]
