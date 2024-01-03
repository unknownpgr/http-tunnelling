mod protocol;
use protocol::{
    read_frame, register, send_close, send_data, send_heartbeat, FRAME_TYPE_CLOSE, FRAME_TYPE_DATA,
    FRAME_TYPE_HEARTBEAT_ACK, FRAME_TYPE_LOG, FRAME_TYPE_UNREGISTER,
};
use rand;
use std::collections::HashMap;
use std::env;
use std::fs::File;
use std::io::{Read, Write};
use std::net::{Shutdown, TcpStream};
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

fn try_shutdown(stream: &TcpStream) {
    if let Err(_) = stream.shutdown(Shutdown::Both) {
        // Ignore
    }
}

fn create_application_connection(
    server_stream: &TcpStream,
    id: u32,
    host: &str,
    port: u16,
) -> Result<TcpStream, ()> {
    let stream = match TcpStream::connect(format!("{}:{}", host, port)) {
        Ok(stream) => stream,
        Err(_) => {
            send_close(&server_stream, id).unwrap();
            return Err(());
        }
    };
    return Ok(stream);
}

fn connection_thread(
    server_stream: &TcpStream,
    mut app_stream: &TcpStream,
    id: u32,
    connections: Arc<RwLock<HashMap<u32, TcpStream>>>,
) {
    // looping, send all data from application to server.
    loop {
        let mut buf = [0; 1024 * 100];
        match app_stream.read(&mut buf) {
            Ok(n) => {
                if n == 0 {
                    // If application closed the connection, send close frame to server.
                    try_shutdown(app_stream);
                    send_close(server_stream, id).unwrap();
                    connections.write().unwrap().remove(&id);
                    break;
                } else {
                    // If data received, send data frame to server.
                    send_data(server_stream, id, buf[0..n].to_vec()).unwrap();
                }
            }
            Err(_) => {
                // If error occurred, send close frame to server.
                try_shutdown(app_stream);
                send_close(server_stream, id).unwrap();
                connections.write().unwrap().remove(&id);
                break;
            }
        }
    }
}

fn handle_heartbeat(
    server_stream: Arc<RwLock<TcpStream>>,
    clear_flag: Arc<RwLock<bool>>,
    stop_flag: Arc<RwLock<bool>>,
) {
    loop {
        if !*clear_flag.read().unwrap() {
            println!("Shutting down server stream...");
            let server_stream = server_stream.read().unwrap();
            try_shutdown(&server_stream);
            break;
        }

        match send_heartbeat(&server_stream.read().unwrap()) {
            Ok(_) => {}
            Err(_) => {
                break;
            }
        }

        // Else, set clear_flag and wait for 30 seconds.
        *clear_flag.write().unwrap() = true;

        for _ in 0..30 {
            if *stop_flag.read().unwrap() {
                break;
            }
            thread::sleep(time::Duration::from_secs(1));
        }
    }
}

fn parse_args() -> (String, String) {
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

    (app_url, server_url)
}

fn try_connect(server_host: &str, server_port: u16) -> TcpStream {
    loop {
        // Connect to server.
        // If connection failed, retry after 5 seconds.
        println!("Connecting to server...");
        let stream = match TcpStream::connect((server_host, server_port)) {
            Ok(stream) => stream,
            Err(_) => {
                println!("Failed to connect to server, retrying in 5 seconds...");
                thread::sleep(time::Duration::from_secs(5));
                continue;
            }
        };
        println!("Connected to server.");
        return stream;
    }
}

fn main() {
    // Parse args.
    let (app_url, server_url) = parse_args();

    // Parse application url and server url.
    let (app_host, app_port) = parse_host(&app_url);
    let (server_host, server_port) = parse_host(&server_url);

    println!("Application host: {}", app_host);
    println!("Application port: {}", app_port);

    // Issue an id for this worker.
    let id = issue_id();

    loop {
        // Connect to server.
        let stream = try_connect(&server_host, server_port);

        let clear_flag = Arc::new(RwLock::new(true));
        let stop_flag = Arc::new(RwLock::new(false));

        // Define stream. Because stream should be access from both main thread and heartbeat thread,
        // we need to wrap it with Arc and RwLock.
        let stream = Arc::new(RwLock::new(stream));

        let heartbeat_thread_handler = {
            // Clone variables to pass to thread.
            let stream = stream.clone();
            let clear_flag = clear_flag.clone();
            let stop_flag = stop_flag.clone();
            thread::spawn(move || handle_heartbeat(stream, clear_flag, stop_flag))
        };

        // Get stream from Arc.
        let stream = stream.read().unwrap();

        // Register worker id to server.
        register(&stream, id.clone()).unwrap();

        // Get subdomain from server.
        let subdomain = {
            let (frame_type, _, data) = read_frame(&stream);
            if frame_type != FRAME_TYPE_LOG {
                println!("Unexpected frame type: {}", frame_type);
                try_shutdown(&stream);
                continue;
            }
            let response = String::from_utf8(data).unwrap();
            let subdomain = response.split(":").nth(1).unwrap().to_string();
            subdomain
        };

        println!("https://{}.{}", subdomain, server_host);

        // Connections to application.
        let connections = Arc::new(RwLock::new(HashMap::new()));

        loop {
            // Wait connection from server
            let (frame_type, id, data) = read_frame(&stream);
            match frame_type {
                FRAME_TYPE_CLOSE => {
                    // Close connection
                    send_close(&stream, id).unwrap();
                }
                FRAME_TYPE_DATA => {
                    // If connection to application is not established, create a new connection.
                    if !connections.read().unwrap().contains_key(&id) {
                        let app_stream =
                            create_application_connection(&stream, id, &app_host, app_port);
                        match app_stream {
                            Ok(app_stream) => {
                                connections
                                    .write()
                                    .unwrap()
                                    .insert(id, app_stream.try_clone().unwrap());
                            }
                            Err(_) => {
                                println!("Failed to connect to application.");
                                send_close(&stream, id).unwrap();
                                continue;
                            }
                        }
                    }

                    {
                        // Print size of connections
                        let connections = connections.read().unwrap();
                        println!("Connections: {}", connections.len());
                    }

                    // Send data to application.
                    {
                        let _connections = connections.read().unwrap();
                        let mut app_stream = _connections.get(&id).unwrap();
                        match app_stream.write(&data) {
                            Ok(_) => {}
                            Err(_) => {
                                println!("Failed to send data to application.");
                                try_shutdown(app_stream);
                                send_close(&stream, id).unwrap();
                                continue;
                            }
                        }
                        let stream = stream.try_clone().unwrap();
                        let app_stream = app_stream.try_clone().unwrap();
                        let connections = connections.clone();
                        thread::spawn(move || {
                            connection_thread(&stream, &app_stream, id, connections);
                        });
                    }
                }
                FRAME_TYPE_HEARTBEAT_ACK => {
                    // Clear clear_flag.
                    *clear_flag.write().unwrap() = true;
                }
                FRAME_TYPE_LOG => {
                    // Print log
                    println!("{}", String::from_utf8(data).unwrap());
                }
                FRAME_TYPE_UNREGISTER => {
                    println!("Disconnected from server.");
                    *stop_flag.write().unwrap() = true;
                    break;
                }
                _ => {
                    // Do nothing
                }
            }
        }
        heartbeat_thread_handler.join().unwrap();
    }
}
