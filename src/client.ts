import crypto from "crypto";
import net from "net";
import fs from "fs";
import {
  getReader,
  register,
  sendClose,
  sendData,
  FRAME_TYPE,
  sendHeartbeat,
} from "./lib";
import { config } from "./config";

const serverHost = config.SERVER_HOST;
const serverPort = config.SERVER_CLIENT_PORT;

// Get application url from args
const applicationUrl = process.argv[2];

// Parse application url
const [applicationHost, applicationPort] = applicationUrl.split(":");
const applicationPortNumber = applicationPort ? parseInt(applicationPort) : 80;

const ID = (() => {
  try {
    const id = fs.readFileSync("client-id");
    if (id.length !== 32) throw new Error("Invalid client-id file");
    return id;
  } catch (e) {
    const id = crypto.randomBytes(32);
    fs.writeFileSync("client-id", id);
    return id;
  }
})();

const sockets: { [_: number]: net.Socket } = {};

function createTimeout(timeout: number, onTimeout: () => void) {
  let timeoutId: NodeJS.Timeout;
  const refresh = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(onTimeout, timeout);
  };
  const clear = () => clearTimeout(timeoutId);
  return { refresh, clear };
}

function createSocket(id: number, client: net.Socket) {
  const socket = net.createConnection(applicationPortNumber, applicationHost);

  // Clear socket with no data for 5 minutes
  const { refresh, clear } = createTimeout(5 * 60 * 1000, () => {
    console.log("Client socket timeout");
    socket.destroy();
    delete sockets[id];
  });

  socket.on("data", (data) => {
    sendData(client, id, data);
    refresh();
  });

  socket.on("close", () => {
    sendClose(client, id);
    clear();
    delete sockets[id];
  });

  socket.on("error", (e) => {
    sendClose(client, id);
    clear();
    delete sockets[id];
  });

  sockets[id] = socket;
}

async function main() {
  while (true) {
    console.log("Connecting to server");
    const client = net.createConnection(serverPort, serverHost);

    // Register to server
    register(client, ID);

    // Send heartbeat every 30 seconds. If no heartbeat ack is received, disconnect
    const { refresh, clear } = createTimeout(30 * 1000, () => {
      client.destroy();
    });
    setInterval(() => {
      refresh();
      sendHeartbeat(client);
    }, 30 * 1000);

    const read = getReader();

    client.on("data", (_data) => {
      const frames = read(_data);
      for (const frame of frames) {
        const { type, id, data } = frame;

        if (type & FRAME_TYPE.DATA) {
          if (!sockets[id]) createSocket(id, client);
          sockets[id].write(data);
        }

        if (type & FRAME_TYPE.CLOSE) {
          if (sockets[id]) {
            sockets[id].end();
            delete sockets[id];
          }
        }

        if (type & FRAME_TYPE.LOG) {
          console.log(data.toString());
        }

        clear();
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
    clear();

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
