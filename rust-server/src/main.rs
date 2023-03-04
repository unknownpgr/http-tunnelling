use std::{
    collections::HashMap,
    io::{prelude::*, BufReader},
    net::{TcpListener, TcpStream},
    sync::{Arc, Mutex},
    thread,
};

fn parse_http_request(request: &String) -> HashMap<String, String> {
    let mut headers = HashMap::new();
    let mut lines = request.split("\r");
    lines.next().unwrap();
    for line in lines {
        if line.is_empty() {
            break;
        }
        let mut parts = line.split(": ");
        let key = parts.next().unwrap();
        let value = parts.next().unwrap();
        headers.insert(key.to_owned(), value.to_owned());
    }
    headers
}

fn handle_client(mut stream: &TcpStream, workers: &ThreadSafeHashMap<String, &TcpStream>) {
    let reader = BufReader::new(stream);

    let mut request = String::new();

    for line in reader.lines() {
        let line = line.unwrap();
        request.push_str(&line);
        request.push_str("\r");
        if line.is_empty() {
            break;
        }
    }

    let headers = parse_http_request(&request);
    let host = headers.get("Host").unwrap();

    let workers = workers.lock().unwrap();

    // Check if worker exists
    if !workers.contains_key(host) {
        // If not, response 404 to client
        let response = "HTTP/1.1 404 Not Found\r\r";
        stream.write(response.as_bytes()).unwrap();
        stream.flush().unwrap();
        return;
    }

    let mut worker = *workers.get(host).unwrap();
    worker.write(request.as_bytes()).unwrap();
    worker.flush().unwrap();

    let mut response = String::new();
    let mut reader = BufReader::new(worker);
    reader.read_to_string(&mut response).unwrap();

    stream.write(response.as_bytes()).unwrap();
    stream.flush().unwrap();
}

fn client_server(
    workers: &ThreadSafeHashMap<String, &TcpStream>,
    clients: &ThreadSafeHashMap<String, &TcpStream>,
) {
    let listener = TcpListener::bind("0.0.0.0:80").unwrap();

    thread::scope(|scope| {
        for stream in listener.incoming() {
            let stream = stream.unwrap();
            scope.spawn(move || handle_client(&stream, workers));
        }
    });
}

fn worker_server(
    workers: &ThreadSafeHashMap<String, &TcpStream>,
    clients: &ThreadSafeHashMap<String, &TcpStream>,
) {
    let listener = TcpListener::bind("0.0.0.0:81").unwrap();
}

type ThreadSafeHashMap<K, V> = Arc<Mutex<HashMap<K, V>>>;

fn get_thread_safe_hashmap<K, V>() -> ThreadSafeHashMap<K, V> {
    let map = HashMap::new();
    Arc::new(Mutex::new(map))
}

fn main() {
    let workers = get_thread_safe_hashmap();
    let clients = get_thread_safe_hashmap();

    let handle_client = {
        let workers = workers.clone();
        let clients = clients.clone();
        thread::spawn(move || {
            client_server(&workers, &clients);
        })
    };

    let handle_worker = {
        let workers = workers.clone();
        let clients = clients.clone();
        thread::spawn(move || {
            worker_server(&workers, &clients);
        })
    };

    handle_client.join().unwrap();
    handle_worker.join().unwrap();
}
