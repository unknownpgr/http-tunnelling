FROM node:18

WORKDIR /app

ADD ./dist/client.js ./client.js

ENTRYPOINT [ "node", "client.js" ]
