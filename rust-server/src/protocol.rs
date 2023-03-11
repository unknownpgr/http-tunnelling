use std::io::prelude::*;
use std::net::TcpStream;

const FRAME_TYPE_UNREGISTER: u8 = 0x0;
const FRAME_TYPE_DATA: u8 = 0x1;
const FRAME_TYPE_CLOSE: u8 = 0x2;
const FRAME_TYPE_LOG: u8 = 0x4;
const FRAME_TYPE_REGISTER: u8 = 08;
const FRAME_TYPE_HEARTBEAT: u8 = 0x10;
const FRAME_TYPE_HEARTBEAT_ACK: u8 = 0x20;

type Frame = (u8, u32, Vec<u8>);

fn send(mut stream: &TcpStream, t: u8, id: u32, data: Vec<u8>) {
    let mut frame = vec![t];

    frame.push((id >> 24) as u8);
    frame.push((id >> 16) as u8);
    frame.push((id >> 8) as u8);
    frame.push(id as u8);

    let len: u32 = data.len() as u32;
    frame.push((len >> 24) as u8);
    frame.push((len >> 16) as u8);
    frame.push((len >> 8) as u8);
    frame.push(len as u8);

    frame.extend(data);
    stream.write(&frame).unwrap();
}

pub fn register(stream: &TcpStream, data: Vec<u8>) {
    send(&stream, FRAME_TYPE_REGISTER, 0, data);
}

pub fn send_data(stream: &TcpStream, id: u32, data: Vec<u8>) {
    send(&stream, FRAME_TYPE_DATA, id, data);
}

pub fn send_log(stream: &TcpStream, data: Vec<u8>) {
    send(&stream, FRAME_TYPE_LOG, 0, data);
}

pub fn send_close(stream: &TcpStream, id: u32) {
    let data = vec![];
    send(&stream, FRAME_TYPE_CLOSE, id, data);
}

pub fn send_heartbeat(stream: &TcpStream) {
    let data = vec![];
    send(&stream, FRAME_TYPE_HEARTBEAT, 0, data);
}

pub fn send_heartbeat_ack(stream: &TcpStream) {
    let data = vec![];
    send(&stream, FRAME_TYPE_HEARTBEAT_ACK, 0, data);
}

pub fn read_frame(mut stream: &TcpStream) -> Frame {
    let mut buf = [0; 9];
    let err = stream.read_exact(&mut buf);

    if err.is_err() {
        return (FRAME_TYPE_UNREGISTER, 0, vec![]);
    }

    let t = buf[0];
    let id = ((buf[1] as u32) << 24)
        + ((buf[2] as u32) << 16)
        + ((buf[3] as u32) << 8)
        + (buf[4] as u32);
    let len = ((buf[5] as u32) << 24)
        + ((buf[6] as u32) << 16)
        + ((buf[7] as u32) << 8)
        + (buf[8] as u32);
    let mut data = vec![0; len as usize];
    stream.read_exact(&mut data).unwrap();
    (t, id, data)
}
