import { serverApp } from "./app";

const port = Number(process.env.NORI_API_PORT ?? 8787);
serverApp.listen(port, "127.0.0.1", () => {
  console.log(`Nori API listening on http://127.0.0.1:${port}`);
});
