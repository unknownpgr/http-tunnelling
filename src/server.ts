import net from "net";
import crypto from "crypto";
import {
  sendLog,
  sendData,
  sendClose,
  getReader,
  FRAME_TYPE,
  sendHeartbeatAck,
} from "./lib";
import { config } from "./config";

// Server URL
function getServerUrl(subdomain: string) {
  return `${config.SERVER_PROTOCOL}://${subdomain}.${config.SERVER_HOST}`;
}

// Create subdomain
function getSubdomain(data: Buffer) {
  return crypto
    .createHash("sha256")
    .update(data)
    .update(config.SERVER_RANDOM_KEY)
    .digest("hex")
    .slice(0, 16);
}

// Create Uid
let counter = 0;
function createUid() {
  return counter++;
}

// Test if the data is a valid HTTP request and return subdomain
function getSubdomainFromClientID(data: Buffer) {
  const httpRequest = data.toString();
  const lines = httpRequest.split("\n").map((x) => x.trim());
  const headers: { [_: string]: string } = lines
    .slice(1)
    .reduce((acc, line) => {
      const [key, value] = line.split(": ");
      acc[key] = value;
      return acc;
    }, {} as { [_: string]: string });

  if (!headers.Host || !headers.Host.includes(".")) {
    return null;
  }

  const subdomain = headers.Host.split(".")[0];
  return subdomain;
}

// Dictionary of clients
const clients: { [_: string]: net.Socket } = {};

// Dictionary of users
const users: { [_: string]: { [_: number]: net.Socket } } = {};

// Create a server for clients
const clientServer = net.createServer((socket) => {
  let id: string | null = null;

  console.log("Client connected");

  function onDisconnect() {
    console.log("Client disconnected: " + id);
    delete clients[id];
    for (const userId in users[id]) {
      users[id][userId].destroy();
    }
  }

  // Remove the client from the dictionary when it disconnects
  socket.on("close", onDisconnect);
  socket.on("error", onDisconnect);

  const read = getReader();

  // Listen for data from the client
  socket.on("data", (data) => {
    const frames = read(data);
    for (const frame of frames) {
      const { type, id: uid, data } = frame;
      if (type & FRAME_TYPE.REGISTER) {
        id = getSubdomain(data);
        console.log("Client registered: " + id);
        clients[id] = socket;
        users[id] = {};
        sendLog(socket, Buffer.from(getServerUrl(id)));
      }
      if (type & FRAME_TYPE.DATA)
        if (users[id] && users[id][uid]) users[id][uid].write(data);
      if (type & FRAME_TYPE.CLOSE)
        if (users[id] && users[id][uid]) users[id][uid].end();
      if (type & FRAME_TYPE.LOG) console.log(data.toString());
      if (type & FRAME_TYPE.HEARTBEAT) sendHeartbeatAck(socket);
    }
  });
});

const userServer = net.createServer(async (userSocket) => {
  let subdomain: string | null = null;
  let uid = createUid();

  // Listen for data from the user
  userSocket.on("data", (data) => {
    if (!subdomain) {
      subdomain = getSubdomainFromClientID(data);

      if (!subdomain || !clients[subdomain]) {
        console.log("Bad Request");
        // Temporary redirect to 404.html, with query parameter `url`
        userSocket.write(
          `HTTP/1.1 307 Temporary Redirect\r` +
            `Location: /404.html?url=${encodeURIComponent(
              getServerUrl(subdomain || "")
            )}\r\r`
        );
        return;
      }

      users[subdomain][uid] = userSocket;

      const onDisconnect = () => {
        if (!subdomain) return;
        if (clients[subdomain]) sendClose(clients[subdomain], uid);
        delete users[subdomain][uid];
      };

      userSocket.on("close", onDisconnect);
      userSocket.on("error", onDisconnect);
    }

    sendData(clients[subdomain], uid, data);
  });
});

clientServer.listen(config.SERVER_CLIENT_PORT, () => {
  console.log(`Client server listening on port ${config.SERVER_CLIENT_PORT}`);
});

userServer.listen(config.SERVER_USER_PORT, () => {
  console.log(`User server listening on port ${config.SERVER_USER_PORT}`);
});
