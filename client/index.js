const net = require("net");
/**

- Protocol definition
  - `type` - `0` is data, `1` is close, `2` is create, `3` is log.
  - `id` - ID of the stream. This is used to identify the socket.
  - `length` - Length of the data. This is only used when `type` is `0` or `3`.
  - `data` - Data of the frame. This is only used when `type` is `0` or `3`.
- This will be serialized as follows.
  - `type` - 1 byte
  - `id` - 4 byte
  - `length` - 4 byte
  - `data` - `length` byte

*/

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

// Connect to server

const serverHost = "tunnel.unknownpgr.com";
const serverPort = 81;

// Get application url from args
const applicationUrl = process.argv[2];

// Parse application url
const [applicationHost, applicationPort] = applicationUrl.split(":");
const applicationPortNumber = applicationPort ? parseInt(applicationPort) : 80;

const dataParser = getDataParser();
const sockets = {};

async function main() {
  while (true) {
    console.log("Connecting to server");
    const client = net.createConnection(serverPort, serverHost);

    function createSocket(id) {
      const socket = net.createConnection(
        applicationPortNumber,
        applicationHost,
        () => {
          console.log("Connected to application");
        }
      );

      socket.on("data", (data) => {
        sendData(client, id, data);
      });

      socket.on("close", () => {
        sendClose(client, id);
        delete sockets[id];
      });

      sockets[id] = socket;
    }

    client.on("data", (_data) => {
      const frames = dataParser(_data);

      for (const frame of frames) {
        const { type, id, data } = frame;

        if (type === 0) {
          // Data
          if (!sockets[id]) createSocket(id);
          sockets[id].write(data);
        }

        if (type === 1) {
          // Close
          if (sockets[id]) {
            sockets[id].end();
            delete sockets[id];
          }
        }

        if (type === 3) {
          // Log
          console.log(data.toString());
        }
      }
    });

    const join = new Promise((resolve, reject) => {
      client.on("close", resolve);
      client.on("error", reject);
    });

    try {
      await join;
    } catch (e) {
      console.error(e);
    }
    console.log("Disconnected from server");

    // Destroy all sockets
    for (const id in sockets) {
      sockets[id].destroy();
      delete sockets[id];
    }

    console.log("Waiting for 5 seconds");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

main();
