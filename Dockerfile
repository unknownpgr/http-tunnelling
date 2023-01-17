FROM node:18

WORKDIR /app

ADD ./client.min.js ./index.js

ENTRYPOINT [ "node", "index.js" ]