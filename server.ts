import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { createRelayServer, handleUpgrade } from "./lib/ws-relay";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const port = parseInt(process.env.PORT || "3000", 10);

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // WebSocket relay server
  const wss = createRelayServer();

  server.on("upgrade", (req, socket, head) => {
    handleUpgrade(req, socket, head, wss);
  });

  server.listen(port, () => {
    console.log(`> Server ready on http://localhost:${port}`);
    console.log(`> WebSocket relay on ws://localhost:${port}/api/ws-relay`);
  });
});
