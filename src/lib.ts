import net from "net";

const TYPE_DATA = 0x01;
const TYPE_CLOSE = 0x02;
const TYPE_LOG = 0x04;

const NUMBER_TO_TYPE = {
  [TYPE_DATA]: "data",
  [TYPE_CLOSE]: "close",
  [TYPE_LOG]: "log",
};

type Frame = {
  type: number;
  id: number;
  data: Buffer;
};

function send(socket: net.Socket, type: number, id?: number, data?: Buffer) {
  const header = Buffer.alloc(9);
  header.writeUInt8(type, 0);
  header.writeUInt32BE(id || 0, 0);
  header.writeUInt32BE(data?.length || 0, 5);
  socket.write(Buffer.concat([header, data || Buffer.alloc(0)]));
}

function sendData(socket: net.Socket, id: number, data: Buffer) {
  send(socket, TYPE_DATA, id, data);
}

function sendLog(socket: net.Socket, data: Buffer) {
  send(socket, TYPE_LOG, 0, data);
}

function sendClose(socket: net.Socket, id: number) {
  send(socket, TYPE_CLOSE, id);
}

function getReader() {
  let buffer = Buffer.alloc(0);

  return (data: Buffer) => {
    buffer = Buffer.concat([buffer, data]);
    const frames: Frame[] = [];

    while (buffer.length >= 9) {
      const type = buffer.readUInt8(0);
      const id = buffer.readUInt32BE(1);
      const length = buffer.readUInt32BE(5);
      if (buffer.length < 9 + length) {
        break;
      }
      const data = buffer.subarray(9, 9 + length);
      buffer = buffer.subarray(9 + length);
      frames.push({ type, id, data });
    }

    return frames;
  };
}

// Export the functions and type constants
export {
  TYPE_DATA,
  TYPE_CLOSE,
  TYPE_LOG,
  NUMBER_TO_TYPE,
  sendData,
  sendLog,
  sendClose,
  getReader,
};
