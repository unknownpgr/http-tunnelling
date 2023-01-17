const net = require("net");
const stream = require("stream");

// Get application address and server address from command line arguments
const [applicationAddr, serverAddr] = process.argv.slice(2);

function parseAddress(addr) {
  const [ip, port] = addr.split(":");
  const portNumber = port ? parseInt(port) : 80;
  return [ip, portNumber];
}

const [serverIp, serverPort] = parseAddress(serverAddr);
const [applicationIp, applicationPort] = parseAddress(applicationAddr);

const client = net.createConnection(serverPort, serverIp, () => {
  console.log(`Connected to ${serverIp}:${serverPort}`);

  const passThrough = new stream.PassThrough();

  // Connect to client
  const clientSocket = net.createConnection(
    applicationPort,
    applicationIp,
    () => {
      console.log(`Connected to ${applicationIp}:${applicationPort}`);

      // Pipe the client socket to the pass through
      clientSocket.pipe(passThrough);
      passThrough.pipe(clientSocket);

      // Close client socket when pass through is closed
      passThrough.on("close", () => {
        clientSocket.end();
      });
    }
  );

  let isInitialized = false;

  client.on("data", (data) => {
    const text = data.toString();

    if (!isInitialized) {
      const [url, others] = text.split("|");
      console.log(url);
      passThrough.write(others);
      client.pipe(passThrough);
      passThrough.pipe(client);

      client.on("close", () => {
        passThrough.end();
      });

      isInitialized = true;
    }
  });
});
