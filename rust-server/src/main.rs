use md5;
mod protocol;
use protocol::{read_frame, send_close, send_data, send_heartbeat, send_heartbeat_ack, send_log};
use std::{
    collections::HashMap,
    io::{prelude::*, BufReader},
    net::{Shutdown, TcpListener, TcpStream},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
    thread,
}; // 0.8

/**
 * 자바스크립트와 같은 방식으로 접근해서는 안 된다.
 * 자바스크립트는 이벤트 기반으로 동작한다. 즉, 비동기가 매우 자연스럽다.
 * 그러나 러스트는 기본적으로 C언어처럼 동기 언어로 동작한다.
 *
 * 나는 지금 두 개 이상의 스레드에서 한 개의 소켓에 접근하려고 한다.
 * 이것을 어떻게 개선할 수 있을까?
 */

type ThreadSafeHashMap<K, V> = Arc<Mutex<HashMap<K, V>>>;

static UID_COUNTER: AtomicUsize = AtomicUsize::new(0);

fn get_uid() -> u32 {
    UID_COUNTER.fetch_add(1, Ordering::SeqCst) as u32
}

fn get_subdomain(seed: Vec<u8>) -> String {
    // Generate random subdomain from seed
    let hash = md5::compute(seed);
    let mut subdomain = String::new();
    for i in 0..8 {
        let mut num = 0;
        for j in 0..4 {
            num += (hash[i * 4 + j] as u32) << (j * 8);
        }
        subdomain.push_str(&format!("{:x}", num));
    }
    subdomain
}

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

fn handle_client<'a>(
    mut stream: TcpStream,
    workers: &ThreadSafeHashMap<String, TcpStream>,
    clients: &ThreadSafeHashMap<u32, TcpStream>,
) {
    let reader = BufReader::new(&stream);

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

    // If worker exists, register this stream to clients.
    // The id of this client is subdomain + uid
    let uid = get_uid();
    let mut clients = clients.lock().unwrap();
    clients.insert(uid, stream);

    let worker = workers.get(host).unwrap();
    send_data(worker, uid, request.as_bytes().to_vec());
}

fn client_server<'a>(
    workers: &ThreadSafeHashMap<String, TcpStream>,
    clients: &ThreadSafeHashMap<u32, TcpStream>,
) {
    let listener = TcpListener::bind("0.0.0.0:80").unwrap();

    thread::scope(|scope| {
        for stream in listener.incoming() {
            let stream: TcpStream = stream.unwrap();
            scope.spawn(move || handle_client(stream, workers, clients));
        }
    });
}

fn handle_worker<'a>(
    stream: TcpStream,
    workers: &ThreadSafeHashMap<String, TcpStream>,
    clients: &ThreadSafeHashMap<u32, TcpStream>,
) {
    let (frame_type, id, data) = read_frame(&stream);
    // This frame, which is the first frame, must be a REGISTER frame.
    if frame_type != 0x08 {
        panic!("First frame must be REGISTER frame");
    }

    let subdomain = get_subdomain(data);
    println!("Worker {} registered with subdomain {}", id, subdomain);
    let mut workers = workers.lock().unwrap();
    workers.insert(subdomain.clone(), stream);

    // At this point, ownership of `stream` is moved to `workers`.
    // Therefore, we cannot use `stream` anymore.
    // We need to get the stream from `workers` again.

    // `stream` below is not the same as `stream` above.
    // `stream` below is a reference to the stream in `workers`.
    // However, `stream` above is an actual stream.
    let stream = workers.get(&subdomain).unwrap();

    loop {
        let (frame_type, id, data) = read_frame(stream);
        match frame_type {
            0x00 => {
                // UNREGISTER
                let stream = workers.remove(&subdomain).unwrap();
                stream.shutdown(Shutdown::Both).unwrap();
                break;
            }

            0x01 => {
                // DATA
                let clients = clients.lock().unwrap();
                let mut client = clients.get(&id).unwrap();
                client.write(&data).unwrap();
                client.flush().unwrap();
            }

            0x02 => {
                // CLOSE
                let mut clients = clients.lock().unwrap();
                let client = clients.get(&id).unwrap();
                // Disconnect client
                client.shutdown(Shutdown::Both).unwrap();
                clients.remove(&id);
            }

            0x04 => {
                //LOG
                let data = String::from_utf8(data).unwrap();
                println!("Worker {} log: {}", id, data);
            }

            0x08 => {
                //REGISTER, Panic here.
                panic!("Worker {} tried to register again", id);
            }

            _ => {}
        }
    }
}

fn worker_server(
    workers: &ThreadSafeHashMap<String, TcpStream>,
    clients: &ThreadSafeHashMap<u32, TcpStream>,
) {
    let listener = TcpListener::bind("0.0.0.0:81").unwrap();

    thread::scope(|scope| {
        for stream in listener.incoming() {
            let stream: TcpStream = stream.unwrap();
            scope.spawn(move || handle_worker(stream, workers, clients));
        }
    });
}

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
