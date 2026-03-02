import WebSocket from "ws";

const socketMessageQueue = new WeakMap<WebSocket, unknown[]>();
const socketMessageResolvers = new WeakMap<WebSocket, Array<(value: unknown) => void>>();

export function connectSocket(url: string, sessionToken?: string) {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url, {
      headers: sessionToken ? { cookie: `authjs.session-token=${sessionToken}` } : {}
    });
    socketMessageQueue.set(socket, []);
    socketMessageResolvers.set(socket, []);

    socket.on("message", (data) => {
      let parsed: unknown;

      try {
        parsed = JSON.parse(String(data));
      } catch {
        return;
      }

      const resolvers = socketMessageResolvers.get(socket);

      if (resolvers && resolvers.length > 0) {
        const next = resolvers.shift();

        if (next) {
          next(parsed);
          return;
        }
      }

      const queue = socketMessageQueue.get(socket);

      if (queue) {
        queue.push(parsed);
      }
    });

    socket.once("open", () => {
      resolve(socket);
    });

    socket.once("error", (error) => {
      reject(error);
    });
  });
}

export function connectExpectRejected(url: string, sessionToken?: string) {
  return new Promise<{ statusCode?: number; code?: number; reason?: string }>((resolve) => {
    const socket = new WebSocket(url, {
      headers: sessionToken ? { cookie: `authjs.session-token=${sessionToken}` } : {}
    });
    const timeout = setTimeout(() => {
      socket.terminate();
      resolve({ reason: "timeout" });
    }, 1000);

    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timeout);
      resolve({ statusCode: response.statusCode });
    });

    socket.once("close", (code, reason) => {
      clearTimeout(timeout);
      resolve({ code, reason: String(reason) });
    });

    socket.once("error", () => {
      clearTimeout(timeout);
      resolve({});
    });
  });
}

export function waitForMessage(socket: WebSocket) {
  return new Promise<any>((resolve, reject) => {
    const queued = socketMessageQueue.get(socket);

    if (queued && queued.length > 0) {
      resolve(queued.shift());
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error("timed out waiting for websocket message"));
    }, 1000);

    const resolvers = socketMessageResolvers.get(socket);

    if (!resolvers) {
      clearTimeout(timeout);
      reject(new Error("missing socket resolver queue"));
      return;
    }

    resolvers.push((value) => {
      clearTimeout(timeout);
      resolve(value);
    });

    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

export async function waitForMessageType(socket: WebSocket, type: string) {
  for (let index = 0; index < 5; index += 1) {
    const message = await waitForMessage(socket);

    if (message && typeof message === "object" && "type" in message && message.type === type) {
      return message;
    }
  }

  throw new Error(`timed out waiting for websocket message type ${type}`);
}

export function closeSocket(socket: WebSocket) {
  return new Promise<void>((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }

    socket.once("close", () => {
      resolve();
    });

    socket.close();
  });
}
