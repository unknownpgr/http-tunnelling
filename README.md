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
curl https://raw.githubusercontent.com/unknownpgr/http-tunnelling/master/dist/client.js -q | node - example.com 8080
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

```text
+-----------------+-----------------+-----------------+-----------------+
| 1 byte          | 4 bytes         | 4 bytes         | N bytes         |
+-----------------+-----------------+-----------------+-----------------+
| frame type      | stream id       | data  length    |  data           |
+-----------------+-----------------+-----------------+-----------------+
```

- frame type은 다음과 같은 종류가 있다.

  - `0x01`: 데이터 프레임
  - `0x02`: 연결 프레임
  - `0x04`: 로그 프레임

- stream id는 4바이트 정수로, 각 연결마다 고유한 id를 가진다.
- data length는 4바이트 정수로, data의 길이를 나타낸다.
- data는 data length만큼의 바이트로, 데이터를 나타낸다.
