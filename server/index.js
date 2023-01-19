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

  socket.on("data", (data) => {
    if (callback) {
      callback(data);
      callback = null;
    } else {
      buffer = Buffer.concat([buffer, data]);
    }
  });

  return () => {
    return new Promise((resolve) => {
      if (buffer.length > 0) {
        const data = buffer;
        buffer = Buffer.alloc(0);
        resolve(data);
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

function handleFinish(socket) {
  socket.on("close", () => {
    console.log("Socket closed");
  });

  socket.on("error", (err) => {
    console.log("Socket error");
    console.log(err);
  });
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
  const clientId = clientData.toString();
  console.log("ClientId: ", clientId);

  const [subdomain, url] = getUrl(clientId);
  clientSockets[subdomain] = clientSocket;
  clientSocket.write(url + "|");

  // Remove all on data listeners
  clientSocket.removeAllListeners("data");

  // Handle the client socket
  handleFinish(clientSocket);

  clientSocket.on("data", (data) => {
    // Data format is: id (4 bytes) | length (4 bytes) | data
    const id = data.subarray(0, 4).readUInt32BE();
    const length = data.subarray(4, 8).readUInt32BE();
    const payload = data.subarray(8, 8 + length);

    const userSocket = userSockets[id];
    if (userSocket) {
      userSocket.write(payload);
    } else {
      console.log("User socket not found");
    }
  });
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
  userSockets[userId] = userSocket;

  // Remove all on data listeners
  userSocket.removeAllListeners("data");

  // Handle the user socket
  handleFinish(userSocket);

  // Send the request to the client
  sendToClient(clientSockets[subdomain], userId, data);

  userSocket.on("data", (data) => {
    // If client socket is not found, send 502 Bad Gateway and close the socket
    if (!(subdomain in clientSockets)) {
      console.log(`Subdomain ${subdomain} not found`);
      userSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      userSocket.end();
      return;
    }

    // Send the data to the client
    sendToClient(clientSockets[subdomain], userId, data);
  });
});

clientServer.listen(CLIENT_PORT, () => {
  console.log("Client server listening on port CLIENT_PORT");
});

userServer.listen(80, () => {
  console.log("User server listening on port 80");
});
