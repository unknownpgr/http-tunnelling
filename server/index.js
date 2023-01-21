// Create a TCP socket server
const crypto = require("crypto");
const net = require("net");

const CLIENT_PORT = 81;
const DOMAIN = "tunnel.unknownpgr.com";
const clientSockets = {};
const userSockets = {};

function getUrl(id) {
  // Generate subdomain from md5 hash of ip and port
  const hash = crypto.createHash("md5");
  hash.update(id);
  const subdomain = hash.digest("hex").slice(0, 8);

  // Return the subdomain and the url
  return [subdomain, `https://${subdomain}.${DOMAIN}`];
}

function getSocketReader(socket) {
  let callback = null;
  let buffer = Buffer.alloc(0);
  let isClosed = false;

  socket.on("data", (data) => {
    buffer = Buffer.concat([buffer, data]);
    if (callback) {
      callback(buffer);
      buffer = Buffer.alloc(0);
      callback = null;
    }
  });

  // If socket is closed or error occurs, throw an error
  socket.on("close", () => {
    isClosed = true;
    if (callback) {
      callback(null);
    }
  });

  socket.on("error", (err) => {
    isClosed = true;
    if (callback) {
      callback(null);
    }
  });

  return () => {
    return new Promise((resolve) => {
      if (buffer.length > 0) {
        const data = buffer;
        buffer = Buffer.alloc(0);
        resolve(data);
      } else if (isClosed) {
        resolve(null);
      } else {
        callback = resolve;
      }
    });
  };
}

let counter = 0;
function getUniqueId() {
  return counter++;
}

function sendToClient(client, userId, data) {
  // Data format is: id (4 bytes) | length (4 bytes) | data
  const buffer = Buffer.alloc(8 + data.length);
  buffer.writeUInt32BE(userId, 0);
  buffer.writeUInt32BE(data.length, 4);
  data.copy(buffer, 8);
  client.write(buffer);
}

const clientServer = net.createServer(async (clientSocket) => {
  console.log(
    `New client connection from ${clientSocket.remoteAddress}:${clientSocket.remotePort}`
  );

  const read = getSocketReader(clientSocket);

  const clientData = await read();

  if (clientData === null) {
    console.log("Client disconnected");
    return;
  }

  const clientId = clientData.toString();
  const [subdomain, url] = getUrl(clientId);
  clientSockets[subdomain] = clientSocket;
  clientSocket.write(url);
  console.log(`Assign subdomain ${subdomain} to client ${clientId}`);

  // Structure of data is id (4 bytes, integer) | length (4 bytes, integer) | data
  let buffer = Buffer.alloc(0);
  let id = -1;
  let length = -1;
  while (true) {
    const data = await read();

    console.log(".");

    if (data === null) {
      console.log("Client disconnected");
      return;
    }

    buffer = Buffer.concat([buffer, data]);
    while (buffer.length >= 8) {
      if (id === -1) {
        id = buffer.readUInt32BE(0);
        length = buffer.readUInt32BE(4);
        buffer = buffer.subarray(8);
      }

      if (buffer.length >= length) {
        const data = buffer.subarray(0, length);
        buffer = buffer.subarray(length);

        if (data.toString() === "close") {
          console.log(`Close user socket ${id} from client`);
          userSockets[id].end();
          delete userSockets[id];
        } else if (userSockets[id]) {
          userSockets[id].write(data);
        } else {
          console.log("User socket not found");
        }

        id = -1;
        length = -1;
      } else {
        break;
      }
    }
  }
});

const userServer = net.createServer(async (userSocket) => {
  console.log(
    `New user connection from ${userSocket.remoteAddress}:${userSocket.remotePort} to ${userSocket.localAddress}:${userSocket.localPort}`
  );

  const read = getSocketReader(userSocket);

  const data = await read();

  const text = data.toString();

  const [method, path] = text.split(" ");
  if (
    !["GET", "POST", "PUT", "DELETE"].includes(method) ||
    !path.startsWith("/")
  ) {
    console.log("Invalid request");
    userSocket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    userSocket.end();
    return;
  }

  // Parse http header
  const headers = {};
  const lines = text.split("\r\n");
  for (let i = 1; i < lines.length; i++) {
    const [key, value] = lines[i].split(": ");
    headers[key] = value;
  }

  // Check if the request is valid
  if (headers.Host === undefined) {
    console.log("No host header");
    userSocket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    userSocket.end();
    return;
  }

  // Get the subdomain from the host
  const subdomain = headers.Host.split(".")[0];

  // Check if the subdomain is valid
  if (!(subdomain in clientSockets)) {
    console.log(`Subdomain ${subdomain} not found`);
    userSocket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    userSocket.end();
    return;
  }

  // Register the user socket
  const userId = getUniqueId();
  console.log("Assign user id: ", userId);
  userSockets[userId] = userSocket;

  // Remove all on data listeners
  userSocket.removeAllListeners("data");

  // Send the request to the client
  sendToClient(clientSockets[subdomain], userId, data);
  console.log(`Send request to client with subdomain ${subdomain}`);

  while (true) {
    const data = await read();
    if (data === null) {
      console.log(`User ${userId} disconnected`);
      sendToClient(clientSockets[subdomain], userId, Buffer.from("close"));
      return;
    }

    if (!(subdomain in clientSockets)) {
      console.log(`Subdomain ${subdomain} not found`);
      userSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      userSocket.end();
      return;
    }

    sendToClient(clientSockets[subdomain], userId, data);
  }
});

clientServer.listen(CLIENT_PORT, () => {
  console.log("Client server listening on port CLIENT_PORT");
});

userServer.listen(80, () => {
  console.log("User server listening on port 80");
});
