# HTTP Tunneling

I needed to access HTTP server on private network. I thought about using some server on the Internet as a mediator server to connect to the worker server.

## Usage

When `node` is installed, (version 10 or higher)

```text
curl -s https://tunnel.unknownpgr.com/client.js | node - [server]
```

or using docker

```text
docker run -it --rm unknownpgr/tunnelling:latest [server]
```

`[server]` is the server in private network that you want to connect to. The format is `host:port` and if port is not specified, it is assumed to be 80.

## Example

```text
$ curl -s https://tunnel.unknownpgr.com/client.js | node - localhost:1234
```

## How it works

Define the following terms.

- The server that you want to connect to in the private network is called `worker server`.
- The server that is accessible from the Internet and connects the Internet to the `worker server` is called `mediator server`.
- The service that the `worker server` wants to publish to the outside world is called `application`.

The operation is, in brief, multiplexing multiple connections between the user and the application and forwarding them. In detail, it is as follows.

1. The `client` runs on the `worker server` and establishes a TCP connection with the `mediator server`.
1. The `client` generates a unique ID that does not change during program execution and sends it to the `mediator server`.
1. The `mediator server` generates a subdomain from the unique ID of the `client` and sends it to the `client`.
1. The `client` prints the subdomain received from the `mediator server` to the console so that the user can use it.
1. From then on, the user connects to the `mediator server` through the subdomain. At this time, multiple socket connections are created, and each connection has a unique ID.
1. The `mediator server` reads the data of the connection and parses the HTTP header, and from this, it decides which `client` to connect to.
1. Then it sends the data to the `client`.
1. When the data is received, the `client` connects to the `application` and sends the response of the `application` to the `mediator server`.
1. The `mediator server` sends the response of the `application` to the user.
1. If the `application` disconnects, the `client` notifies the `mediator server` that the connection is disconnected.
1. The `mediator server` terminates the connection.
1. If the user terminates the connection, the `mediator server` notifies the `client` that the connection is disconnected, and the `client` disconnects from the `application`.

## Note

Protocol between `client` and `mediator server` is as follows.

```text
+-----------------+-----------------+-----------------+-----------------+
| 1 byte          | 4 bytes         | 4 bytes         | N bytes         |
+-----------------+-----------------+-----------------+-----------------+
| frame type      | stream id       | data  length    |  data           |
+-----------------+-----------------+-----------------+-----------------+
```

- `stream id` is 4 bytes integer which is unique for each connection.
- `data length` is 4 bytes integer which is length of data.
- `data` is binary data which is length of `data length`.
- `frame type` has following types.
  - `0x01`: data
  - `0x02`: connection termination
  - `0x04`: log
    - print log to console of other server
  - `0x08`: domain assign request
    - This is special request for assigning subdomain. data contains client's unique ID.
