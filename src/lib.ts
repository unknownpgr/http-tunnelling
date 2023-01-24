import net from "net";

export const FRAME_TYPE = {
  DATA: 0x01,
  CLOSE: 0x02,
  LOG: 0x04,
  REGISTER: 0x08,
  HEARTBEAT: 0x10,
  HEARTBEAT_ACK: 0x20,
};

export const NUMBER_TO_TYPE = {
  0x01: "DATA",
  0x02: "CLOSE",
  0x04: "LOG",
  0x08: "REGISTER",
};

type Frame = {
  type: number;
  id: number;
  data: Buffer;
};

function send(socket: net.Socket, type: number, id?: number, data?: Buffer) {
  const header = Buffer.alloc(9);
  header.writeUInt8(type, 0);
  header.writeUInt32BE(id || 0, 1);
  header.writeUInt32BE(data?.length || 0, 5);
  socket.write(Buffer.concat([header, data || Buffer.alloc(0)]));
}

export function register(socket: net.Socket, id: Buffer) {
  send(socket, FRAME_TYPE.REGISTER, 0, id);
}

export function sendData(socket: net.Socket, id: number, data: Buffer) {
  send(socket, FRAME_TYPE.DATA, id, data);
}

export function sendLog(socket: net.Socket, data: Buffer) {
  send(socket, FRAME_TYPE.LOG, 0, data);
}

export function sendClose(socket: net.Socket, id: number) {
  send(socket, FRAME_TYPE.CLOSE, id);
}

export function sendHeartbeat(socket: net.Socket) {
  send(socket, FRAME_TYPE.HEARTBEAT);
}

export function sendHeartbeatAck(socket: net.Socket) {
  send(socket, FRAME_TYPE.HEARTBEAT_ACK);
}

export function getReader() {
  let buffer = Buffer.alloc(0);

  return (data: Buffer) => {
    buffer = Buffer.concat([buffer, data]);
    const frames: Frame[] = [];

    while (buffer.length >= 9) {
      const type = buffer.readUInt8(0);
      const id = buffer.readUInt32BE(1);
      const length = buffer.readUInt32BE(5);
      if (buffer.length < 9 + length) break;
      const data = buffer.subarray(9, 9 + length);
      buffer = buffer.subarray(9 + length);
      frames.push({ type, id, data });
    }

    return frames;
  };
}
