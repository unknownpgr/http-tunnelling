const net = require("net");
const crypto = require("crypto");

// Get application address and server address from command line arguments
const [applicationAddr] = process.argv.slice(2);

function parseAddress(addr) {
  const [ip, port] = addr.split(":");
  const portNumber = port ? parseInt(port) : 80;
  return [ip, portNumber];
}

const [serverIp, serverPort] = parseAddress("server.unknownpgr.com:81");
const [applicationIp, applicationPort] = parseAddress(applicationAddr);

// Generate a random id for this client
const clientId = crypto.randomBytes(36).toString("hex");

// Promisify the net.connect function
function connect(options) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(options, () => {
      resolve(socket);
    });
  });
}

function join(socket) {
  return new Promise((resolve) => {
    console.log("Joining...");

    socket.on("close", () => {
      resolve();
    });

    socket.on("error", (err) => {
      console.log("Client error");
      console.log(err);
      resolve();
    });
  });
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
  });

  socket.on("error", (err) => {
    isClosed = true;
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

const sockets = {};

async function main() {
  while (true) {
    const client = await connect({ port: serverPort, host: serverIp });
    console.log(`Connected to ${serverIp}:${serverPort}`);
    const read = getSocketReader(client);

    client.write(clientId);
    const clientData = await read();

    // If clientData is null, it means that the server is closed
    if (clientData === null) {
      console.log("Server is closed");
      continue;
    }

    const url = clientData.toString();
    console.log("Url: ", url);

    // Remove every on data listener
    client.removeAllListeners("data");

    // Listen for data from server. Data is format of
    // id (4 bytes, integer) | length (4 bytes) | data

    client.on("data", async (data) => {
      const id = data.slice(0, 4).readUInt32BE();
      const length = data.slice(4, 8).readUInt32BE();
      const content = data.slice(8, 8 + length);

      if (sockets[id]) {
        sockets[id].write(content);
      } else {
        // Create new socket to application
        const socket = await connect({
          port: applicationPort,
          host: applicationIp,
        });

        // Save the socket
        sockets[id] = socket;

        // Send data to application
        socket.write(content);

        // Listen for data from application
        socket.on("data", (data) => {
          // Write data in format of id (4 bytes) | length (4 bytes) | data
          const buffer = Buffer.alloc(8 + data.length);
          buffer.writeUint32BE(id, 0);
          buffer.writeUInt32BE(data.length, 4);
          buffer.set(data, 8);
          client.write(buffer);
        });

        // Error handling
        socket.on("error", (err) => {
          console.log("Application error");
          console.log(err);
          delete sockets[id];
        });

        // Close socket when application closes
        socket.on("close", () => {
          delete sockets[id];
        });
      }
    });

    await join(client);
  }
}

main();
