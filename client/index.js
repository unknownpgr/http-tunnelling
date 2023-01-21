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
      socket.removeAllListeners("error");
      resolve(socket);
    });
    socket.on("error", (err) => {
      resolve(null);
    });
  });
}

function getSocketReader(socket) {
  /**
   * This function will return a function that will return a promise.
   *
   * The promise will resolve when there is data in the socket.
   *
   * If the socket is closed, the promise will resolve with null.
   *
   * If the error occurs, the promise will resolve with null.
   */

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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const sockets = {};

async function main() {
  while (true) {
    const client = await connect({ port: serverPort, host: serverIp });

    // If client is null, it means that the server is closed
    if (client === null) {
      console.log("Server is closed");
      console.log("Reconnecting in 5 seconds");
      await sleep(5000);
      continue;
    }

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

    // Listen for data from server. Data is format of
    // id (4 bytes, integer) | length (4 bytes) | data

    let buffer = Buffer.alloc(0);
    let tmpId = -1;
    let length = -1;

    while (true) {
      const data = await read();
      if (data === null) {
        console.log("Server is closed");

        // Destroy all sockets
        for (const id in sockets) {
          sockets[id].destroy();
        }

        break;
      }
      console.log(".");

      buffer = Buffer.concat([buffer, data]);

      if (tmpId === -1 && buffer.length >= 4) {
        tmpId = buffer.readUInt32BE(0);
        buffer = buffer.subarray(4);
      }

      if (length === -1 && buffer.length >= 4) {
        length = buffer.readUInt32BE(0);
        buffer = buffer.subarray(4);
      }

      if (tmpId !== -1 && length !== -1 && buffer.length >= length) {
        const data = buffer.subarray(0, length);
        buffer = buffer.subarray(length);
        const id = tmpId;
        tmpId = -1;
        length = -1;

        if (data.toString() === "close") {
          if (sockets[id]) {
            console.log(`-${id}`);
            sockets[id].destroy();
            delete sockets[id];
          }
          continue;
        }

        // If there is no socket for this _id, create a new one
        if (!sockets[id]) {
          console.log(`+${id}`);
          // Log the length of the sockets object
          console.log("Sockets: ", Object.keys(sockets).length);
          sockets[id] = net.connect(
            { port: applicationPort, host: applicationIp },
            () => {
              sockets[id].write(data);

              let timeoutTimer = -1;

              // Listen for data from application
              sockets[id].on("data", (data) => {
                const buffer = Buffer.alloc(4 + 4 + data.length);
                buffer.writeUInt32BE(id, 0);
                buffer.writeUInt32BE(data.length, 4);
                data.copy(buffer, 8);
                client.write(buffer);

                if (timeoutTimer !== -1) {
                  clearTimeout(timeoutTimer);
                }
                timeoutTimer = setTimeout(() => {
                  console.log("Timeout");
                  sockets[id].destroy();
                  delete sockets[id];
                }, 10000);
              });

              sockets[id].on("close", () => {
                // If the socket is closed, send "close" to server
                const buffer = Buffer.alloc(4 + 4 + 5);
                buffer.writeUInt32BE(id, 0);
                buffer.writeUInt32BE(5, 4);
                buffer.write("close", 8);
                client.write(buffer);
              });
            }
          );
        } else {
          sockets[id].write(data);
        }
      }
    }
  }
}

main();
