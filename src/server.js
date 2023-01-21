const net = require("net");
const crypto = require("crypto");
const {
  sendLog,
  sendData,
  sendClose,
  TYPE_DATA,
  TYPE_CLOSE,
  TYPE_LOG,
  getReader,
} = require("./lib");

const CLIENT_PORT = 81;

// Server URL
function getServerUrl(subdomain) {
  return `https://${subdomain}.tunnel.unknownpgr.com`;
}

// Create random subdomain
function getRandomSubdomain() {
  return crypto.randomBytes(4).toString("hex");
}

// Create Uid
let counter = 0;
function createUid() {
  return counter++;
}

// Test if the data is a valid HTTP request and return subdomain
function getSubdomainFromRequest(data) {
  const httpRequest = data.toString();
  const lines = httpRequest.split("\n").map((x) => x.trim());
  const headers = lines.slice(1).reduce((acc, line) => {
    const [key, value] = line.split(": ");
    acc[key] = value;
    return acc;
  }, {});

  if (!headers.Host || !headers.Host.includes(".")) {
    return null;
  }

  const subdomain = headers.Host.split(".")[0];
  return subdomain;
}

// Dictionary of clients
const workers = {};

// Dictionary of users
const users = {};

// Create a server for worker
const workerServer = net.createServer((socket) => {
  // Get the subdomain of the worker
  const id = getRandomSubdomain();

  // Add the worker to the dictionary
  workers[id] = socket;
  users[id] = {};

  // Log the worker
  console.log("Worker connected: " + id);

  // Send the server URL to the worker
  sendLog(socket, Buffer.from(getServerUrl(id)));

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
      if (type === TYPE_DATA) {
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
  let subdomain = null;
  let uid = createUid();

  // Listen for data from the user
  userSocket.on("data", (data) => {
    if (!subdomain) {
      subdomain = getSubdomainFromRequest(data);

      if (!subdomain || !workers[subdomain]) {
        console.log("Bar Request");
        userSocket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        userSocket.end();
        return;
      }

      users[subdomain][uid] = userSocket;

      function onDisconnect() {
        if (workers[subdomain]) sendClose(workers[subdomain], uid);
        delete users[subdomain][uid];
      }

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
