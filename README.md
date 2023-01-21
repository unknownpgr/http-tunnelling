# HTTP Tunneling

HTTP 기반 터널링을 할 수 있는 서버 및 클라이언트를 제작한다. 이는 다음과 같이 동작할 것이다.

## Client

- Client는 CLI 툴로, 서버 주소 및 포워딩할 포트를 입력으로 받는다.
- 클라이언트는 초기에 서버에 접속하여 서버로부터 적절한 도메인을 할당받는다.
- 서버 - 클라이언트 간에는 항상 TCP 연결을 유지한다.

## Server

서버는 두 개의 포트를 개방한다. 하나는 API와 접속을 위한 포트, 다른 하나는 TCP 커넥션을 위한 포트다.

## Usage

```bash
curl https://raw.githubusercontent.com/unknownpgr/http-tunnelling/master/client.min.js -q | node - example.com
```

or

```bash
docker run -it --rm unknownpgr/tunnelling:latest example.com
```

## Note

기존에는 나이브한 방법으로 접속이 가능할 거라 생각했는데, 이렇게 하면 여러 request가 동시에 발생하는 경우 문제가 발생한다. 서버에서 클라이언트로 데이터를 보낼 때, 여러 포트를 구분할 수 있는 방법이 요구된다. 이를 위해 multiplexer를 구현한다.

Multiplexer 구현이 불완전하여 오류가 많이 발생하는 것으로 보인다. 이에 소켓의 생애주기를 고려한 더 완전한 Multiplexer를 구현해보자.

- Socket은 Multiplexer에 접속하거나, 데이터를 보내거나, 접속을 종료한다.
- Multiplexer는 Client의 socket을 생성하거나 데이터를 보내거나, socket을 종료한다.
- 이를 위해 간단한 프로토콜을 작성할 필요가 있다.
- 프로토콜은 다음과 같은 구조의 프레임을 교환한다.
  - `type` - `0` is data, `1` is close, `2` is create, `3` is log.
  - `id` - ID of the stream. This is used to identify the socket.
  - `length` - Length of the data. This is only used when `type` is `0` or `3`.
  - `data` - Data of the frame. This is only used when `type` is `0` or `3`.
- This will be serialized as follows.
  - `type` - 1 byte
  - `id` - 4 byte
  - `length` - 4 byte
  - `data` - `length` byte
