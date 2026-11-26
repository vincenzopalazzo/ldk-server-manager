export { LdkServerClient, type LdkServerApi, type LdkServerClientOptions } from './client.js';
export { GrpcWebTransport, type TransportOptions } from './transport.js';
export { LdkServerError, GrpcCode, grpcCodeName } from './errors.js';
export { bindMacaroonToRequest, buildMacaroonHeader } from './auth.js';
export { encodeFrame, FrameReader, parseTrailers } from './framing.js';

export * from './gen/api_pb.js';
export * from './gen/types_pb.js';
export * from './gen/events_pb.js';
export * from './gen/error_pb.js';

// Re-export the protobuf helpers callers need to build nested messages.
export { create, toJson, fromJson } from '@bufbuild/protobuf';
export type { MessageInitShape, MessageShape } from '@bufbuild/protobuf';
