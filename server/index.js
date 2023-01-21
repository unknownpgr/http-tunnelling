const net = require("net");
const crypto = require("crypto");

function abstractSend(socket, type, id, data) {
  let buffer;
  if (data) buffer = Buffer.alloc(9 + data.length);
  else buffer = Buffer.alloc(9);
  buffer.writeUInt8(type, 0);
  buffer.writeUInt32BE(id, 1);
  if (data) {
    buffer.writeUInt32BE(data.length, 5);
    data.copy(buffer, 9);
  } else {
    buffer.writeUInt32BE(0, 5);
  }
  socket.write(buffer);
}

function sendData(socket, id, data) {
  abstractSend(socket, 0, id, data);
}

function sendLog(socket, id, data) {
  abstractSend(socket, 3, id, data);
}

function sendClose(socket, id) {
  abstractSend(socket, 1, id, Buffer.alloc(0));
}

function getDataParser() {
  let buffer = Buffer.alloc(0);

  return (data) => {
    buffer = Buffer.concat([buffer, data]);

    const frames = [];

    while (buffer.length >= 9) {
      const type = buffer.readUInt8(0);
      const id = buffer.readUInt32BE(1);
      const length = buffer.readUInt32BE(5);
      if (buffer.length < 9 + length) {
        break;
      }
      const data = buffer.subarray(9, 9 + length);
      buffer = buffer.subarray(9 + length);
      frames.push({ type, id, data });
    }

    return frames;
  };
}

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

  // Send url from subdomain to the worker
  sendLog(socket, id, Buffer.from(getServerUrl(id)));

  // Remove the worker from the dictionary when it is closed
  socket.on("close", () => {
    console.log("Worker disconnected: " + id);
    delete workers[id];
    for (const userId in users[id]) {
      users[id][userId].destroy();
    }
  });

  // Remove the worker from the dictionary when an error occurs
  socket.on("error", () => {
    console.log("Worker disconnected: " + id);
    delete workers[id];
    for (const userId in users[id]) {
      users[id][userId].destroy();
    }
  });

  const parser = getDataParser();

  // Listen for data from the worker
  socket.on("data", (data) => {
    const frames = parser(data);
    for (const frame of frames) {
      const { type, id: uid, data } = frame;
      console.log(type, uid, data.length);
      if (type === 0) {
        // Data
        if (users[id] && users[id][uid]) users[id][uid].write(data);
      } else if (type === 1) {
        // Close
        if (users[id] && users[id][uid]) {
          users[id][uid].end();
        }
      } else if (type === 2) {
        // Cannot send create from worker
      } else if (type === 3) {
        // Log
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
      // Get the subdomain of the user
      const httpRequest = data.toString();

      // Parse http request and get headers
      const lines = httpRequest.split("\n").map((x) => x.trim());
      const headers = lines.slice(1).reduce((acc, line) => {
        const [key, value] = line.split(": ");
        acc[key] = value;
        return acc;
      }, {});

      console.log(headers);

      // Check if the host is valid.
      if (!headers.Host || !headers.Host.includes(".")) {
        console.log("Invalid host");
        userSocket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        userSocket.end();
        return;
      }

      // Get the subdomain from the host
      subdomain = headers.Host.split(".")[0];

      // Check if the subdomain is valid
      if (!workers[subdomain]) {
        console.log("Invalid subdomain");
        userSocket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        userSocket.end();
        return;
      }

      users[subdomain][uid] = userSocket;

      userSocket.on("close", () => {
        // Send close to the worker
        if (workers[subdomain]) sendClose(workers[subdomain], uid);
        delete users[subdomain][uid];
      });

      userSocket.on("error", () => {
        if (workers[subdomain]) sendClose(workers[subdomain], uid);
        delete users[subdomain][uid];
      });
    }

    // Send data to the worker
    sendData(workers[subdomain], uid, data);
  });
});

workerServer.listen(CLIENT_PORT, () => {
  console.log("Client server listening on port " + CLIENT_PORT);
});

userServer.listen(80, () => {
  console.log("User server listening on port 80");
});
