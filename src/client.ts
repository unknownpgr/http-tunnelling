import crypto from "crypto";
import net from "net";
import fs from "fs";
import { getReader, register, sendClose, sendData, FRAME_TYPE } from "./lib";
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

function createSocket(id: number, client: net.Socket) {
  const socket = net.createConnection(applicationPortNumber, applicationHost);

  socket.on("data", (data) => {
    sendData(client, id, data);
  });

  socket.on("close", () => {
    sendClose(client, id);
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
