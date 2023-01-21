# HTTP Tunneling

사설망에 있는 서버에 띄운 HTTP 서버에 접속할 필요가 생겼다. 이때 포트포워딩이나 SSH를 통한 터널링보다 안전하면서 안정적인 방법이 필요하게 되었다.
이에 인터넷에서 접속 가능한 어떤 서버를 중개 서버로 이용, 중개 서버를 통해 워커 서버에 접속할 수 있도록 하는 방법을 생각해보았다.

## Usage

```bash
curl https://raw.githubusercontent.com/unknownpgr/http-tunnelling/master/dist/client.js -q | node - example.com 8080
```

or

```bash
docker run -it --rm unknownpgr/tunnelling:latest example.com
```

## How it works

먼저 다음과 같이 용어를 정의한다.

- 사설망에 있는 접속하고자 하는 서버를 `워커 서버`라고 부르기로 한다.
- 인터넷에 접속 가능하며 `워커 서버`와 인터넷을 연결하는 다른 서버를 `중개 서버`라고 부르기로 한다.
- `워커 서버`에서 외부로 공개하고자 하는 서비스를 `어플리케이션`이라고 부르기로 한다.

동작방식은, 간략하게는 유저와 어플리케이션 사이의 여러 연결을 multiplexing하여 포워딩하는 것인데, 상세하게는 다음과 같다.

1. `클라이언트`는 `워커 서버` 위에서 동작하며 `중개 서버`와 하나의 TCP 연결을 맺는다.
2. `클라이언트`는 프로그램 실행 중에 변하지 않는 고유한 ID를 생성하며, 이를 `중개 서버`에 전달한다.
3. `중개 서버`는 `클라이언트`의 와 마찬가지로 프로그램 실행 중에 변하지 않는 고유한 ID로부터 서브 도메인을 생성하고 이를 `클라이언트`에 전달한다.
4. `클라이언트`는 `중개 서버`로부터 받은 서브 도메인을 유저가 이용할 수 있도록 콘솔에 출력한다.
5. 이후 유저가 `중개 서버`의 서브 도메인을 통해 접속한다. 이때 여러 개의 소켓 커넥션이 생성되며, 각 커넥션은 고유한 ID를 가진다.
6. `중개 서버`는 커넥션의 데이터를 읽어 HTTP 헤더를 파싱하고, 이로부터 서브도메인을 추출하여 어떤 `클라이언트`에게 연결할지 결정한다.
7. 이후 `클라이언트`에게 데이터를 전송한다.
8. 데이터를 전달받으면 `클라이언트`는 `어플리케이션`에 접속하고, `어플리케이션`의 응답을 `중개 서버`에 전달한다.
9. `중개 서버`는 `어플리케이션`의 응답을 유저에게 전달한다.
10. 만약 `어플리케이션`에서 연결을 끊으면 `클라이언트`는 `중개 서버`에 연결이 끊겼음을 알린다.
11. `중개 서버`는 해당 커넥션을 종료한다.
12. 반대로 유저가 연결을 종료하면 `중개 서버`는 `클라이언트`에게 연결이 끊겼음을 알리며 `클라이언트`는 `어플리케이션`에 연결을 끊는다.

## Note

기존에는 userServer로 들어오는 데이터를 적당히 포워딩해주기만 하면 될 거라 생각했는데, 이렇게 하면 여러 request가 동시에 발생하는 경우 문제가 발생한다.

- 일단 서버 측에 데이터가 전송될 때 데이터가 섞여 전송될 가능성이 있으며
- 반대로 서버에서 클라이언트로 데이터를 보낼 때 마찬가지의 문제가 발생한다.
- 또한 여러 포트를 구분할 수 있는 방법이 요구된다.

이를 위해 multiplexer를 구현한다.

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
