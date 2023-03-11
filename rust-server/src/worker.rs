mod protocol;
use protocol::{
    read_frame, register, send_close, send_data, FRAME_TYPE_CLOSE, FRAME_TYPE_DATA,
    FRAME_TYPE_HEARTBEAT_ACK, FRAME_TYPE_LOG,
};
use rand;
use std::collections::HashMap;
use std::env;
use std::fs::File;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::sync::{Arc, RwLock};
use std::thread;
use std::time;

fn parse_host(host: &str) -> (String, u16) {
    let mut parts = host.split(':');
    let host = parts.next().unwrap().to_string();
    let port = parts.next().unwrap().parse().unwrap();
    (host, port)
}

fn issue_id() -> Vec<u8> {
    // Check if file named `client-id` exists.
    if Path::new("client-id").exists() {
        // If exists, read the content of the file.
        let mut file = File::open("client-id").unwrap();
        let mut id = Vec::new();
        file.read_to_end(&mut id).unwrap();
        id
    } else {
        // If not, generate a random id and write it to the file.
        let id = rand::random::<[u8; 16]>();
        let mut file = File::create("client-id").unwrap();
        file.write_all(&id).unwrap();
        id.to_vec()
    }
}

fn create_application_connection(
    server_stream: &TcpStream,
    id: u32,
    host: &str,
    port: u16,
    connections: &Arc<RwLock<HashMap<u32, TcpStream>>>,
) -> Result<TcpStream, ()> {
    let stream = match TcpStream::connect(format!("{}:{}", host, port)) {
        Ok(stream) => {
            connections
                .write()
                .unwrap()
                .insert(id, stream.try_clone().unwrap());
            stream
        }
        Err(_) => {
            send_close(&server_stream, id);
            return Err(());
        }
    };
    return Ok(stream);
}

fn connection_thread(server_stream: &TcpStream, mut app_stream: &TcpStream, id: u32) {
    // looping, send all data from application to server.
    loop {
        let mut buf = [0; 1024];
        match app_stream.read(&mut buf) {
            Ok(n) => {
                if n == 0 {
                    // If application closed the connection, send close frame to server.
                    send_close(server_stream, id);
                    break;
                } else {
                    // If data received, send data frame to server.
                    send_data(server_stream, id, buf[0..n].to_vec());
                }
            }
            Err(_) => {
                // If error occurred, send close frame to server.
                send_close(server_stream, id);
                break;
            }
        }
    }
}

fn main() {
    // Get application url and server url from args.
    let args: Vec<String> = env::args().collect();

    // If application url is not provided, assume it as 'localhost:80'
    let app_url = if args.len() > 1 {
        args[1].clone()
    } else {
        "localhost:80".to_string()
    };

    // If server url is not provided, assume it as 'tunnel.unknownpgr.com:81'
    let server_url = if args.len() > 2 {
        args[2].clone()
    } else {
        "tunnel.unknownpgr.com:81".to_string()
    };

    // Parse application url and server url.
    let (app_host, app_port) = parse_host(&app_url);
    let (server_host, server_port) = parse_host(&server_url);

    // Get worker id.
    let id = issue_id();

    loop {
        // Connect to server.
        // If connection failed, retry after 5 seconds.
        let stream = match TcpStream::connect((server_host.as_str(), server_port)) {
            Ok(stream) => stream,
            Err(_) => {
                println!("Failed to connect to server, retrying in 5 seconds...");
                thread::sleep(time::Duration::from_secs(5));
                continue;
            }
        };

        // Connection to application.
        let connections = Arc::new(RwLock::new(HashMap::new()));

        // Register
        register(&stream, id.clone());

        // Wait connection from server
        loop {
            let (frame_type, id, data) = read_frame(&stream);
            match frame_type {
                FRAME_TYPE_CLOSE => {
                    // Close connection
                    send_close(&stream, id);
                }
                FRAME_TYPE_DATA => {
                    // If connection to application is not established, create a new connection.
                    if !connections.read().unwrap().contains_key(&id) {
                        let app_stream = create_application_connection(
                            &stream,
                            id,
                            &app_host,
                            app_port,
                            &connections,
                        );
                        if app_stream.is_err() {
                            continue;
                        }
                        let app_stream = app_stream.unwrap();
                        let stream = stream.try_clone().unwrap();
                        thread::spawn(move || {
                            connection_thread(&stream, &app_stream, id);
                        });
                    }

                    // Send data to application.
                    let connections = connections.read().unwrap();
                    let mut app_stream = connections.get(&id).unwrap();
                    match app_stream.write(&data) {
                        Ok(_) => {}
                        Err(_) => {
                            send_close(&stream, id);
                        }
                    }
                }
                FRAME_TYPE_HEARTBEAT_ACK => {
                    // Do nothing
                }
                FRAME_TYPE_LOG => {
                    // Print log
                    println!("{}", String::from_utf8(data).unwrap());
                }
                _ => {
                    // Do nothing
                }
            }
        }
    }
}
