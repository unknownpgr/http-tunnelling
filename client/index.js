const net = require("net");
const crypto = require("crypto");

// Get application address and server address from command line arguments
const [applicationAddr, serverAddr] = process.argv.slice(2);

function parseAddress(addr) {
  const [ip, port] = addr.split(":");
  const portNumber = port ? parseInt(port) : 80;
  return [ip, portNumber];
}

const [serverIp, serverPort] = parseAddress(serverAddr);
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
  });
}

async function main() {
  while (true) {
    const client = await connect({ port: serverPort, host: serverIp });
    client.write(clientId);

    console.log(`Connected to ${serverIp}:${serverPort}`);

    let isInitialized = false;
    let application;

    function connectToApplication() {
      if (application) return;

      application = net.createConnection(applicationPort, applicationIp, () => {
        console.log(`Connected to application`);
      });

      application.pipe(client);
      client.pipe(application);

      application.on("close", () => {
        console.log(`Disconnected from application`);
        client.unpipe(application);
        application = null;
      });
    }

    client.on("data", (data) => {
      connectToApplication();
      const text = data.toString();
      if (!isInitialized) {
        const [url, others] = text.split("|");
        console.log(url);
        if (others) application.write(others);
        isInitialized = true;
        return;
      }
    });

    await join(client);
  }
}

main();
