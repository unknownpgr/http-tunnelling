use md5;
mod protocol;
use protocol::{
    read_frame, send_close, send_data, send_heartbeat_ack, send_log, FRAME_TYPE_CLOSE,
    FRAME_TYPE_DATA, FRAME_TYPE_HEARTBEAT, FRAME_TYPE_LOG, FRAME_TYPE_REGISTER,
    FRAME_TYPE_UNREGISTER,
};
use std::{
    collections::HashMap,
    io::{prelude::*, BufReader},
    net::{Shutdown, TcpListener, TcpStream},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, RwLock,
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
 * 근본적으로 하나의 변수에 두 개의 reference가 존재할 수 있는가?
 */

type ThreadSafeHashMap<K, V> = Arc<RwLock<HashMap<K, V>>>;

static UID_COUNTER: AtomicUsize = AtomicUsize::new(0);

fn get_uid() -> u32 {
    UID_COUNTER.fetch_add(1, Ordering::SeqCst) as u32
}

fn get_subdomain(seed: Vec<u8>) -> String {
    // Generate random subdomain from seed.
    let hash = md5::compute(seed);
    let mut subdomain = String::new();
    for i in 0..2 {
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
    clients_worker_map: &ThreadSafeHashMap<u32, String>,
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
    let subdomain = host.split(".").next().unwrap();

    let workers = workers.read().unwrap();

    // Check if worker exists
    if !workers.contains_key(subdomain) {
        // If not, response 404 to client
        let response = "HTTP/1.1 404 Not Found\r\r";
        stream.write(response.as_bytes()).unwrap();
        stream.flush().unwrap();
        return;
    }

    // Register client
    let uid = get_uid();
    {
        let mut clients = clients.write().unwrap();
        clients.insert(uid, stream);
        let mut clients_worker_map = clients_worker_map.write().unwrap();
        clients_worker_map.insert(uid, subdomain.to_owned());
    }

    let worker = workers.get(subdomain).unwrap();
    send_data(worker, uid, request.as_bytes().to_vec());

    // Wait until client disconnects
    {
        let clients = clients.read().unwrap();
        let mut stream = clients.get(&uid).unwrap();
        let mut buf = [0; 1];
        stream.read(&mut buf).unwrap();
    }

    // When client disconnects, send CLOSE frame to worker
    send_close(worker, uid);

    // Remove client from clients
    let mut clients = clients.write().unwrap();
    clients.remove(&uid);

    // Remove client from clients_worker_map
    let mut clients_worker_map = clients_worker_map.write().unwrap();
    clients_worker_map.remove(&uid);
}

fn client_server<'a>(
    workers: &ThreadSafeHashMap<String, TcpStream>,
    clients: &ThreadSafeHashMap<u32, TcpStream>,
    clients_worker_map: &ThreadSafeHashMap<u32, String>,
) {
    let listener = TcpListener::bind("0.0.0.0:80").unwrap();

    thread::scope(|scope| {
        for stream in listener.incoming() {
            let stream: TcpStream = stream.unwrap();
            scope.spawn(move || handle_client(stream, workers, clients, clients_worker_map));
        }
    });
}

fn handle_worker<'a>(
    stream: TcpStream,
    workers: &ThreadSafeHashMap<String, TcpStream>,
    clients: &ThreadSafeHashMap<u32, TcpStream>,
    clients_worker_map: &ThreadSafeHashMap<u32, String>,
) {
    let (frame_type, _, data) = read_frame(&stream);
    if frame_type != 0x08 {
        panic!("First frame must be REGISTER frame");
    }

    let subdomain = get_subdomain(data);
    println!("Worker registered: {}", subdomain);
    send_log(
        &stream,
        format!("subdomain:{}", subdomain).as_bytes().to_vec(),
    );

    {
        let mut workers = workers.write().unwrap();
        workers.insert(subdomain.clone(), stream);
    }

    let _workers = workers.read().unwrap();
    let stream = _workers.get(&subdomain).unwrap();

    loop {
        let (frame_type, id, data) = read_frame(stream);
        match frame_type {
            FRAME_TYPE_UNREGISTER => {
                {
                    let mut workers = workers.write().unwrap();
                    let stream = workers.remove(&subdomain).unwrap();
                    stream.shutdown(Shutdown::Both).unwrap();

                    // Close all related clients
                    let mut clients_worker_map = clients_worker_map.write().unwrap();
                    let mut clients = clients.write().unwrap();
                    let mut to_remove = Vec::new();
                    for (id, worker) in clients_worker_map.iter() {
                        if worker == &subdomain {
                            to_remove.push(*id);
                        }
                    }
                    for id in to_remove {
                        clients_worker_map.remove(&id);
                        let stream = clients.remove(&id).unwrap();
                        stream.shutdown(Shutdown::Both).unwrap();
                    }
                }
                break;
            }

            FRAME_TYPE_DATA => {
                let clients = clients.read().unwrap();
                let mut client = clients.get(&id).unwrap();
                client.write(&data).unwrap();
                client.flush().unwrap();
            }

            FRAME_TYPE_CLOSE => {
                let mut clients = clients.write().unwrap();
                if !clients.contains_key(&id) {
                    continue;
                }
                let client = clients.get(&id).unwrap();
                client.shutdown(Shutdown::Both).unwrap();
                clients.remove(&id);

                let mut clients_worker_map = clients_worker_map.write().unwrap();
                clients_worker_map.remove(&id);
            }

            FRAME_TYPE_LOG => {
                let data = String::from_utf8(data).unwrap();
                println!("Worker {} log: {}", id, data);
            }

            FRAME_TYPE_REGISTER => {
                panic!("Worker {} tried to register again", id);
            }

            FRAME_TYPE_HEARTBEAT => {
                send_heartbeat_ack(stream);
            }

            _ => {
                // Unknown frame type
                panic!("Unknown frame type {}", frame_type);
            }
        }
    }
}

fn worker_server(
    workers: &ThreadSafeHashMap<String, TcpStream>,
    clients: &ThreadSafeHashMap<u32, TcpStream>,
    clients_worker_map: &ThreadSafeHashMap<u32, String>,
) {
    let listener = TcpListener::bind("0.0.0.0:81").unwrap();

    thread::scope(|scope| {
        for stream in listener.incoming() {
            let stream: TcpStream = stream.unwrap();
            scope.spawn(move || handle_worker(stream, workers, clients, clients_worker_map));
        }
    });
}

fn get_thread_safe_hashmap<K, V>() -> ThreadSafeHashMap<K, V> {
    let map = HashMap::new();
    Arc::new(RwLock::new(map))
}

fn main() {
    let workers = get_thread_safe_hashmap();
    let clients = get_thread_safe_hashmap();
    let clients_worker_map = get_thread_safe_hashmap();

    let handle_client = {
        let workers = workers.clone();
        let clients = clients.clone();
        let clients_worker_map = clients_worker_map.clone();
        thread::spawn(move || {
            client_server(&workers, &clients, &clients_worker_map);
        })
    };

    let handle_worker = {
        let workers = workers.clone();
        let clients = clients.clone();
        let clients_worker_map = clients_worker_map.clone();
        thread::spawn(move || {
            worker_server(&workers, &clients, &clients_worker_map);
        })
    };

    handle_client.join().unwrap();
    handle_worker.join().unwrap();
}
