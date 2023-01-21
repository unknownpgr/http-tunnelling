import net from "net";
const {
  sendData,
  sendClose,
  getReader,
  TYPE_DATA,
  TYPE_CLOSE,
  TYPE_LOG,
} = require("./lib");

// Connect to server
const serverHost = "tunnel.unknownpgr.com";
const serverPort = 81;

// Get application url from args
const applicationUrl = process.argv[2];

// Parse application url
const [applicationHost, applicationPort] = applicationUrl.split(":");
const applicationPortNumber = applicationPort ? parseInt(applicationPort) : 80;

const read = getReader();
const sockets: { [_: number]: net.Socket } = {};

async function main() {
  while (true) {
    console.log("Connecting to server");
    const client = net.createConnection(serverPort, serverHost);

    const createSocket = (id: number) => {
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
    };

    client.on("data", (_data) => {
      const frames = read(_data);

      for (const frame of frames) {
        const { type, id, data } = frame;

        if (type === TYPE_DATA) {
          if (!sockets[id]) createSocket(id);
          sockets[id].write(data);
        }

        if (type === TYPE_CLOSE) {
          if (sockets[id]) {
            sockets[id].end();
            delete sockets[id];
          }
        }

        if (type === TYPE_LOG) {
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
