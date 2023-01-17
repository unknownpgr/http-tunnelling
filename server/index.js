// Create a TCP socket server
const crypto = require("crypto");
const net = require("net");

const CLIENT_PORT = 81;
const DOMAIN = "tunnel.server.unknownpgr.com";
const subdomains = {};

function getUrl() {
  let subdomain;
  do subdomain = crypto.randomBytes(8).toString("hex");
  while (subdomain in subdomains);
  return [subdomain, `https://${subdomain}.${DOMAIN}`];
}

const clientServer = net.createServer(async (socket) => {
  console.log(
    `New connection from ${socket.remoteAddress}:${socket.remotePort} to ${socket.localAddress}:${socket.localPort}`
  );

  const [subdomain, url] = getUrl();
  subdomains[subdomain] = socket;
  socket.write(url + "|");

  function onClose() {
    console.log(
      `Connection from ${socket.remoteAddress}:${socket.remotePort} closed`
    );
    delete subdomains[subdomain];
  }

  socket.on("close", onClose);
  socket.on("error", (err) => {
    console.log(
      `Connection from ${socket.remoteAddress}:${socket.remotePort} error`
    );
    console.log(err);
    onClose();
  });
});

clientServer.listen(CLIENT_PORT, () => {
  console.log("Client server listening on port CLIENT_PORT");
});

const userServer = net.createServer(async (socket) => {
  socket.on("data", (data) => {
    // Convert data to string
    const text = data.toString();

    // Parse the data and check if data is valid http request
    const [method, path] = text.split(" ");
    if (method !== "GET" || !path.startsWith("/")) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.end();
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
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.end();
      return;
    }

    // Get the subdomain from the host
    const subdomain = headers.Host.split(".")[0];

    // Check if the subdomain is valid
    if (!(subdomain in subdomains)) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.end();
      return;
    }

    // Get the socket from the subdomain
    const clientSocket = subdomains[subdomain];

    // Send the request to the client
    clientSocket.write(text);

    // Pipe the socket to the client sockets
    socket.pipe(clientSocket);
    clientSocket.pipe(socket);

    // Close client socket when socket is closed
    socket.on("close", () => {
      clientSocket.end();
    });
  });
});

userServer.listen(80, () => {
  console.log("User server listening on port 80");
});
