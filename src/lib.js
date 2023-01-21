const TYPE_DATA = 0x01;
const TYPE_CLOSE = 0x02;
const TYPE_LOG = 0x04;

const NUMBER_TO_TYPE = {
  [TYPE_DATA]: "data",
  [TYPE_CLOSE]: "close",
  [TYPE_LOG]: "log",
};

function send(socket, type, id, data) {
  // Define buffer
  let buffer;
  if (data) buffer = Buffer.alloc(9 + data.length);
  else buffer = Buffer.alloc(9);

  // Write to buffer
  buffer.writeUInt8(type, 0);
  buffer.writeUInt32BE(id, 1);
  if (data) {
    buffer.writeUInt32BE(data.length, 5);
    data.copy(buffer, 9);
  } else {
    buffer.writeUInt32BE(0, 5);
  }

  // Send buffer
  socket.write(buffer);
}

function sendData(socket, id, data) {
  send(socket, TYPE_DATA, id, data);
}

function sendLog(socket, data) {
  send(socket, TYPE_LOG, 0, data);
}

function sendClose(socket, id) {
  send(socket, TYPE_CLOSE, id);
}

function getReader() {
  let buffer = Buffer.alloc(0);

  return (data) => {
    buffer = Buffer.concat([buffer, data]);
    const frames = [];

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
module.exports = {
  sendData,
  sendLog,
  sendClose,
  getReader,

  TYPE_DATA,
  TYPE_CLOSE,
  TYPE_LOG,
  NUMBER_TO_TYPE,
};
