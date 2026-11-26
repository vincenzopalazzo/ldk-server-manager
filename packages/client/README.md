# @ldk-server-manager/client

Browser-side TypeScript client for [ldk-server](https://github.com/lightningdevkit/ldk-server).

- Types generated from the upstream `.proto` files with `protoc-gen-es` (`pnpm generate`).
- gRPC-Web wire format over `fetch`, including server-streaming for `SubscribeEvents`.
- ldk-server macaroon authentication (`macaroon` header) computed with WebCrypto.

```ts
import { LdkServerClient } from '@ldk-server-manager/client';

const client = new LdkServerClient({ baseUrl: 'https://bridge.example:8080', macaroon: '...' });
const info = await client.api.getNodeInfo();
for await (const event of client.subscribeEvents()) console.log(event);
```

ldk-server itself speaks native gRPC (HTTP/2 trailers), which browsers cannot consume
directly. Put a gRPC-Web bridge in front of it; see `contrib/grpc-web-bridge`.
