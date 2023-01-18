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
  return new Promise((resolve, reject) => {
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

async function main() {
  while (true) {
    const client = await connect({ port: serverPort, host: serverIp });
    client.write(clientId);
    console.log(`Connected to ${serverIp}:${serverPort}`);

    let application;
    function connectToApplication() {
      if (application) return;

      application = net.createConnection(applicationPort, applicationIp, () => {
        console.log(`Connected to application`);
      });

      application.on("close", () => {
        console.log(`Disconnected from application`);
        application = null;
      });

      application.on("error", (err) => {
        console.log("Application error");
        console.log(err);
        application = null;
      });

      application.on("data", (data) => {
        client.write(data);
      });
    }

    // Very simple two-state state machine.
    let isInitialized = false;

    client.on("data", (data) => {
      // Notice that this function is idempotent.
      connectToApplication();
      if (!isInitialized) {
        let url = "";
        for (let i = 0; i < data.length; i++) {
          if (data[i] === 124) break;
          url += String.fromCharCode(data[i]);
        }
        const others = data.slice(url.length + 1);
        console.log("Url: ", url);
        if (others) application.write(others);
        isInitialized = true;
      } else {
        application.write(data);
      }
    });

    // Wait until client is closed
    await join(client);
  }
}

main();
