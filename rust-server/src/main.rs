use std::{
    collections::HashMap,
    io::{prelude::*, BufReader},
    net::{TcpListener, TcpStream},
    thread,
};

// This function takes ownership of reader and never returns it.
fn parse_http_request(reader: BufReader<&TcpStream>) -> (String, HashMap<String, String>) {
    let mut lines = reader.lines();
    let status_header = lines.next().unwrap().unwrap();
    let mut headers = HashMap::new();

    for line in lines {
        let line = line.unwrap();
        if line.is_empty() {
            break;
        }
        let mut parts = line.splitn(2, ": ");
        let name = parts.next().unwrap().to_string();
        let value = parts.next().unwrap().to_string();
        headers.insert(name, value);
    }

    return (status_header, headers);
}

fn handle_user(mut stream: TcpStream) {
    let reader = BufReader::new(&stream);
    let (status_header, headers) = parse_http_request(reader);

    // Print status header
    println!("{}", status_header);

    // Print headers with indent
    for (name, value) in headers {
        println!("  {}: {}", name, value);
    }

    let html = "<!DOCTYPE html>
<html>
<head>
<title>Test</title>
</head>
<body>
<h1>Test</h1>
<p>Received request from <code>{}</code></p>
</body>
</html>"
        .to_string();

    let html = html.replace("{}", &status_header);

    let response = format!(
        "HTTP/1.1 200 OK
Content-Length: {}

{}",
        html.len(),
        html
    );

    stream.write_all(response.as_bytes()).unwrap();
}

fn user_server() {
    let listener = TcpListener::bind("0.0.0.0:80").unwrap();

    for stream in listener.incoming() {
        thread::spawn(|| handle_user(stream.unwrap()));
    }
}

fn main() {
    let handle = thread::spawn(|| {
        user_server();
    });

    handle.join().unwrap();
}
