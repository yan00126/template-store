FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node check.mjs resume.mjs ./
USER node
CMD ["node", "check.mjs"]
