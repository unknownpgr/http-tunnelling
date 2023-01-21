import net from "net";
import crypto from "crypto";
import {
  sendLog,
  sendData,
  sendClose,
  TYPE_DATA,
  TYPE_CLOSE,
  TYPE_LOG,
  getReader,
  TYPE_REGISTER,
} from "./lib";

const CLIENT_PORT = 81;

// Server URL
function getServerUrl(subdomain: string) {
  return `https://${subdomain}.tunnel.unknownpgr.com`;
}

// Create subdomain
const salt = "CIadLOjDL7QguYCPwbKlVHkvc58FzwcgYT3uc2pgDG1wAoQzuhjEj4FCjQ";
function getSubdomain(data: Buffer) {
  return crypto
    .createHash("sha256")
    .update(data)
    .update(salt)
    .digest("hex")
    .slice(0, 8);
}

// Create Uid
let counter = 0;
function createUid() {
  return counter++;
}

// Test if the data is a valid HTTP request and return subdomain
function getSubdomainFromRequest(data: Buffer) {
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
const workers: { [_: string]: net.Socket } = {};

// Dictionary of users
const users: { [_: string]: { [_: number]: net.Socket } } = {};

// Create a server for worker
const workerServer = net.createServer((socket) => {
  let id: string | null = null;

  // Log the worker
  console.log("Worker connected");

  function onDisconnect() {
    console.log("Worker disconnected: " + id);
    delete workers[id];
    for (const userId in users[id]) {
      users[id][userId].destroy();
    }
  }

  // Remove the worker from the dictionary when it disconnects
  socket.on("close", onDisconnect);
  socket.on("error", onDisconnect);

  const read = getReader();

  // Listen for data from the worker
  socket.on("data", (data) => {
    const frames = read(data);
    for (const frame of frames) {
      const { type, id: uid, data } = frame;
      if (type === TYPE_REGISTER) {
        id = getSubdomain(data);
        console.log("Worker registered: " + id);
        workers[id] = socket;
        users[id] = {};
        sendLog(socket, Buffer.from(getServerUrl(id)));
      } else if (type === TYPE_DATA) {
        if (users[id] && users[id][uid]) users[id][uid].write(data);
      } else if (type === TYPE_CLOSE) {
        if (users[id] && users[id][uid]) users[id][uid].end();
      } else if (type === TYPE_LOG) {
        console.log(data.toString());
      } else {
        console.log("Unknown type: " + type);
      }
    }
  });
});

const userServer = net.createServer(async (userSocket) => {
  let subdomain: string | null = null;
  let uid = createUid();

  // Listen for data from the user
  userSocket.on("data", (data) => {
    if (!subdomain) {
      subdomain = getSubdomainFromRequest(data);

      if (!subdomain || !workers[subdomain]) {
        console.log("Bad Request");
        userSocket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        userSocket.end();
        return;
      }

      users[subdomain][uid] = userSocket;

      const onDisconnect = () => {
        if (!subdomain) return;
        if (workers[subdomain]) sendClose(workers[subdomain], uid);
        delete users[subdomain][uid];
      };

      userSocket.on("close", onDisconnect);
      userSocket.on("error", onDisconnect);
    }

    sendData(workers[subdomain], uid, data);
  });
});

workerServer.listen(CLIENT_PORT, () => {
  console.log("Client server listening on port " + CLIENT_PORT);
});

userServer.listen(80, () => {
  console.log("User server listening on port 80");
});
