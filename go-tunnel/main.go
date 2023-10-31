package main

import (
	"crypto/sha256"
	"fmt"
	"net"
	"strings"
	"sync"
)

var FRAME_TYPE = map[string]int{
	"DATA":          0x01,
	"CLOSE":         0x02,
	"LOG":           0x04,
	"REGISTER":      0x08,
	"HEARTBEAT":     0x10,
	"HEARTBEAT_ACK": 0x20,
}

var NUMBER_TYPE = map[int]string{
	0x01: "DATA",
	0x02: "CLOSE",
	0x04: "LOG",
	0x08: "REGISTER",
}

type Frame struct {
	FrameType int
	Id        int
	FrameData []byte
}

func (frame *Frame) length() int {
	return len(frame.FrameData)
}

func bytesToInt(data []byte) int {
	result := 0
	for _, b := range data {
		result = result*256 + int(b)
	}
	return result
}

func intToBytes(data int) []byte {
	result := []byte{0, 0, 0, 0}
	for i := 0; i < 4; i++ {
		result[3-i] = byte(data % 256)
		data = data / 256
	}
	return result
}

func send(conn net.Conn, frame Frame) {
	data := make([]byte, 0)
	// Header
	data = append(data, byte(frame.FrameType))
	data = append(data, intToBytes(frame.Id)...)
	data = append(data, intToBytes(frame.length())...)
	// Body
	data = append(data, frame.FrameData...)
	conn.Write(data)
}

func register(conn net.Conn, host string) {
	frame := Frame{
		FrameType: FRAME_TYPE["REGISTER"],
		Id:        0,
		FrameData: []byte(host),
	}
	send(conn, frame)
}

func sendData(conn net.Conn, id int, data []byte) {
	frame := Frame{
		FrameType: FRAME_TYPE["DATA"],
		Id:        id,
		FrameData: data,
	}
	send(conn, frame)
}

func sendLog(conn net.Conn, data []byte) {
	frame := Frame{
		FrameType: FRAME_TYPE["LOG"],
		Id:        0,
		FrameData: data,
	}
	send(conn, frame)
}

func sendClose(conn net.Conn, id []byte) {
	frame := Frame{
		FrameType: FRAME_TYPE["CLOSE"],
		Id:        bytesToInt(id),
		FrameData: []byte{},
	}
	send(conn, frame)
}

func sendHeartbeat(conn net.Conn) {
	frame := Frame{
		FrameType: FRAME_TYPE["HEARTBEAT"],
		Id:        0,
		FrameData: []byte{},
	}
	send(conn, frame)
}

func sendHeartbeatAck(conn net.Conn) {
	frame := Frame{
		FrameType: FRAME_TYPE["HEARTBEAT_ACK"],
		Id:        0,
		FrameData: []byte{},
	}
	send(conn, frame)
}

var frameId = 0

func getClientId() int {
	frameId++
	return frameId
}

func getServerName(data []byte) string {
	key := []byte("CIadLOjDL7QguYCPwbKlVHkvc58FzwcgYT3uc2pgDG1wAoQzuhjEj4FCjQ")
	hash := fmt.Sprintf("%x", sha256.Sum256(append(data, key...)))
	return hash[:16]
}

var mutex = sync.Mutex{}
var _serverConnections = make(map[string]net.Conn)
var _clientConnections = make(map[string]map[int]net.Conn)

func serverConnectionHandler(conn net.Conn) {
	var buffer = make([]byte, 0)
	var tmpBuffer = make([]byte, 4096)
	var servername = ""

	for {
		n, err := conn.Read(tmpBuffer)
		if err != nil {
			fmt.Println("Failed to Read : ", err)
			break
		}
		buffer = append(buffer, tmpBuffer[:n]...)
		if len(buffer) < 9 {
			continue
		}
		var frameType = int(buffer[0])
		var id = bytesToInt(buffer[1:5])
		var length = bytesToInt(buffer[5:9])
		if len(buffer) < length+9 {
			continue
		}
		var frameData = buffer[9 : length+9]
		buffer = buffer[length+9:]

		switch frameType {
		case FRAME_TYPE["REGISTER"]:
			servername = getServerName(frameData)
			mutex.Lock()
			_serverConnections[servername] = conn
			_clientConnections[servername] = make(map[int]net.Conn)
			mutex.Unlock()
			sendLog(conn, []byte("Server Registered : "+servername))
			fmt.Println("Server Registered : ", servername)

		case FRAME_TYPE["DATA"]:
			client := _clientConnections[servername][id]
			if client == nil {
				fmt.Println("Client not found : ", id)
				continue
			}
			client.Write(frameData)

		case FRAME_TYPE["CLOSE"]:
			client := _clientConnections[servername][id]
			if client == nil {
				fmt.Println("Client not found : ", id)
				continue
			}
			client.Close()
			mutex.Lock()
			delete(_clientConnections[servername], id)
			mutex.Unlock()

		case FRAME_TYPE["LOG"]:
			fmt.Println("Log : ", string(frameData))

		case FRAME_TYPE["HEARTBEAT"]:
			sendHeartbeatAck(conn)

		default:
			fmt.Println("Unknown Frame Type : ", frameType)
		}
	}
}

type ClientConnection struct {
	Id         int
	Conn       net.Conn
	ServerName string
}

func (client *ClientConnection) Close() {
	client.Conn.Close()
	mutex.Lock()
	server := _serverConnections[client.ServerName]
	if server != nil {
		sendClose(server, intToBytes(client.Id))
		delete(_clientConnections[client.ServerName], client.Id)
	}
	mutex.Unlock()
	fmt.Println("Client Disconnected : ", client.Id)
}

func (client *ClientConnection) Read(atLeast int) []byte {
	buffer := make([]byte, 0)
	tmpBuffer := make([]byte, 1024)
	for {
		n, err := client.Conn.Read(tmpBuffer)
		if err != nil {
			client.Close()
			break
		}
		buffer = append(buffer, tmpBuffer[:n]...)
		if len(buffer) >= atLeast {
			break
		}
	}
	return buffer
}

func (client *ClientConnection) Write(data []byte) (int, error) {
	server := _serverConnections[client.ServerName]
	if server == nil {
		client.Close()
		return 0, fmt.Errorf("Server not found")
	}
	sendData(server, client.Id, data)
	return len(data), nil
}

func (client *ClientConnection) init() bool {
	client.Id = getClientId()
	buffer := client.Read(50)
	requestString := string(buffer)
	lines := strings.Split(requestString, "\n")
	serverName := ""
	for _, line := range lines {
		if strings.HasPrefix(line, "Host:") || strings.HasPrefix(line, "host:") {
			host := strings.TrimSpace(strings.Split(line, ":")[1])
			serverName = strings.Split(host, ".")[0]
			break
		}
	}

	if serverName == "" {
		client.Conn.Write([]byte("HTTP/1.1 400 Bad Request\r\n\r\n"))
		client.Close()
		return false
	}

	server := _serverConnections[serverName]
	if server == nil {
		client.Conn.Write([]byte("HTTP/1.1 404 Not Found\r\n\r\n"))
		client.Close()
		return false
	}

	client.ServerName = serverName
	mutex.Lock()
	_clientConnections[serverName][client.Id] = client.Conn
	mutex.Unlock()
	client.Write(buffer)
	return true
}

func clientConnectionHandler(conn net.Conn) {
	client := ClientConnection{
		Conn: conn,
	}
	ret := client.init()
	if !ret {
		return
	}
	fmt.Println("Client Connected : ", client.ServerName)

	buffer := make([]byte, 4096)
	for {
		n, err := conn.Read(buffer)
		fmt.Println("Read : ", n)
		if err != nil {
			client.Close()
			break
		}
		client.Write(buffer[:n])
	}
}

func serverConnectionListener() {
	l, err := net.Listen("tcp", ":81")
	if err != nil {
		fmt.Println("Failed to Listen : ", err)
	}
	defer l.Close()
	for {
		conn, err := l.Accept()
		if err != nil {
			fmt.Println("Failed to Accept : ", err)
			continue
		}
		go serverConnectionHandler(conn)
	}
}

func clientConnectionListener() {
	l, err := net.Listen("tcp", ":80")
	if err != nil {
		fmt.Println("Failed to Listen :", err)
	}
	defer l.Close()
	for {
		conn, err := l.Accept()
		if err != nil {
			fmt.Println("Failed to Accept : ", err)
			continue
		}
		go clientConnectionHandler(conn)
	}
}

func main() {
	var wg sync.WaitGroup
	wg.Add(2)
	go serverConnectionListener()
	go clientConnectionListener()
	wg.Wait()
}
