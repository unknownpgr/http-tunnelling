// Create a TCP socket server
const crypto = require("crypto");
const net = require("net");

const CLIENT_PORT = 81;
const DOMAIN = "tunnel.unknownpgr.com";
const subdomains = {};

function getUrl(id) {
  // Generate subdomain from md5 hash of ip and port
  const hash = crypto.createHash("md5");
  hash.update(id);
  const subdomain = hash.digest("hex").slice(0, 8);

  // Return the subdomain and the url
  return [subdomain, `https://${subdomain}.${DOMAIN}`];
}

const clientServer = net.createServer(async (socket) => {
  console.log(
    `New connection from ${socket.remoteAddress}:${socket.remotePort} to ${socket.localAddress}:${socket.localPort}`
  );

  let isInitialized = false;

  socket.on("data", (data) => {
    if (isInitialized) return;
    const text = data.toString();
    console.log("ClientId: ", text);

    // Notice that socket.remoteAddress and socket.remotePort identifies the client.
    const [subdomain, url] = getUrl(text);
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

    isInitialized = true;
  });
});

clientServer.listen(CLIENT_PORT, () => {
  console.log("Client server listening on port CLIENT_PORT");
});

const userServer = net.createServer(async (userSocket) => {
  console.log(
    `New user connection from ${userSocket.remoteAddress}:${userSocket.remotePort} to ${userSocket.localAddress}:${userSocket.localPort}`
  );

  let subdomain = null;
  let clientSocket = null;

  userSocket.on("data", (data) => {
    // If subdomain is not set, parse the request and get the subdomain
    if (!subdomain) {
      // Convert data to string
      const text = data.toString();

      // Parse the data and check if data is valid http request
      const [method, path] = text.split(" ");
      if (method !== "GET" || !path.startsWith("/")) {
        console.log("Invalid request");
        userSocket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        userSocket.end();
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
        console.log("No host header");
        userSocket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        userSocket.end();
        return;
      }

      // Get the subdomain from the host
      const _subdomain = headers.Host.split(".")[0];

      // Check if the subdomain is valid
      if (!(_subdomain in subdomains)) {
        console.log(`Subdomain ${_subdomain} not found`);
        userSocket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        userSocket.end();
        return;
      }

      subdomain = _subdomain;
      clientSocket = subdomains[subdomain];

      clientSocket.on("data", (data) => {
        userSocket.write(data);
      });

      clientSocket.on("error", (err) => {
        console.log("Client socket error");
        console.log(err);
        userSocket.end();
      });
    }

    if (clientSocket === null) return;
    // Send the request to the client
    clientSocket.write(data);
  });
});

userServer.listen(80, () => {
  console.log("User server listening on port 80");
});
