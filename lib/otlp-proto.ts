// OTLP/HTTP protobuf decoder for the /api/collect ingest path.
//
// Most OpenTelemetry exporters default to OTLP/HTTP with binary protobuf
// (application/x-protobuf). This module decodes that wire format into the
// same JS object shape that the OTLP/JSON path produces, so the rest of the
// collect handler (otlpToPhoenixSpans) does not need to know which transport
// the client used.
//
// Normalization vs. raw protobufjs output:
//   trace_id / span_id / parent_span_id  : Uint8Array → lowercase hex string
//   *_time_unix_nano                     : Long → numeric string
//   enum fields (kind, status.code)      : kept as number (matches JSON)
//
// The proto schema below is the relevant subtree of opentelemetry-proto v1.7.
// Only fields read by otlpToPhoenixSpans are required, but unknown fields in
// the wire payload are tolerated by protobufjs (preserved as raw bytes), so
// future OTel additions will not break ingest.

import * as protobuf from "protobufjs";

const PROTO_SOURCE = `
syntax = "proto3";
package opentelemetry.proto;

message KeyValue {
  string key = 1;
  AnyValue value = 2;
}

message AnyValue {
  oneof value {
    string string_value = 1;
    bool bool_value = 2;
    int64 int_value = 3;
    double double_value = 4;
    ArrayValue array_value = 5;
    KeyValueList kvlist_value = 6;
    bytes bytes_value = 7;
  }
}

message ArrayValue {
  repeated AnyValue values = 1;
}

message KeyValueList {
  repeated KeyValue values = 1;
}

message InstrumentationScope {
  string name = 1;
  string version = 2;
  repeated KeyValue attributes = 3;
  uint32 dropped_attributes_count = 4;
}

message Resource {
  repeated KeyValue attributes = 1;
  uint32 dropped_attributes_count = 2;
}

message Status {
  string message = 2;
  int32 code = 3;
}

message Event {
  fixed64 time_unix_nano = 1;
  string name = 2;
  repeated KeyValue attributes = 3;
  uint32 dropped_attributes_count = 4;
}

message Link {
  bytes trace_id = 1;
  bytes span_id = 2;
  string trace_state = 3;
  repeated KeyValue attributes = 4;
  uint32 dropped_attributes_count = 5;
}

message Span {
  bytes trace_id = 1;
  bytes span_id = 2;
  string trace_state = 3;
  bytes parent_span_id = 4;
  string name = 5;
  int32 kind = 6;
  fixed64 start_time_unix_nano = 7;
  fixed64 end_time_unix_nano = 8;
  repeated KeyValue attributes = 9;
  uint32 dropped_attributes_count = 10;
  repeated Event events = 11;
  uint32 dropped_events_count = 12;
  repeated Link links = 13;
  uint32 dropped_links_count = 14;
  Status status = 15;
}

message ScopeSpans {
  InstrumentationScope scope = 1;
  repeated Span spans = 2;
  string schema_url = 3;
}

message ResourceSpans {
  Resource resource = 1;
  repeated ScopeSpans scope_spans = 2;
  string schema_url = 3;
}

message ExportTraceServiceRequest {
  repeated ResourceSpans resource_spans = 1;
}

// OTLP requires that the response use the same encoding as the request.
// All-success is represented by an empty (or default-valued) message;
// partial_success carries per-span rejection counts when applicable.
message ExportTracePartialSuccess {
  int64 rejected_spans = 1;
  string error_message = 2;
}

message ExportTraceServiceResponse {
  ExportTracePartialSuccess partial_success = 1;
}
`;

const root = protobuf.parse(PROTO_SOURCE, { keepCase: false }).root;
const ExportTraceServiceRequest = root.lookupType(
  "opentelemetry.proto.ExportTraceServiceRequest",
);
const ExportTraceServiceResponse = root.lookupType(
  "opentelemetry.proto.ExportTraceServiceResponse",
);

/**
 * Encode an OTLP ExportTraceServiceResponse. With no arguments (full success)
 * this emits an empty protobuf message — the standard wire shape clients
 * expect when every span was accepted.
 */
export function encodeOtlpTraceResponse(opts?: {
  rejectedSpans?: number;
  errorMessage?: string;
}): Uint8Array {
  const payload =
    opts && (opts.rejectedSpans || opts.errorMessage)
      ? {
          partialSuccess: {
            rejectedSpans: opts.rejectedSpans ?? 0,
            errorMessage: opts.errorMessage ?? "",
          },
        }
      : {};
  return ExportTraceServiceResponse.encode(
    ExportTraceServiceResponse.create(payload),
  ).finish();
}

function bytesToHex(b: Uint8Array | undefined | null): string {
  if (!b || b.length === 0) return "";
  let out = "";
  for (let i = 0; i < b.length; i++) {
    out += b[i].toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Decode an OTLP/HTTP protobuf ExportTraceServiceRequest body.
 *
 * Returns an object shaped like OTLP/JSON (camelCase field names,
 * hex string IDs, string nanosecond timestamps) so downstream code
 * cannot tell which transport produced it.
 *
 * @throws if the body is not valid OTLP protobuf.
 */
export function decodeOtlpProtobufTraces(buf: Uint8Array): {
  resourceSpans: any[];
} {
  const msg = ExportTraceServiceRequest.decode(buf);
  const obj = ExportTraceServiceRequest.toObject(msg, {
    longs: String, // fixed64/int64 → numeric string (otlpToPhoenixSpans calls Number())
    enums: Number,
    bytes: Array, // we hex-encode below
    defaults: false,
    arrays: true,
    objects: true,
  });

  for (const rs of (obj.resourceSpans ?? []) as any[]) {
    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        span.traceId = bytesToHex(toU8(span.traceId));
        span.spanId = bytesToHex(toU8(span.spanId));
        if (span.parentSpanId)
          span.parentSpanId = bytesToHex(toU8(span.parentSpanId));
        for (const link of span.links ?? []) {
          if (link.traceId) link.traceId = bytesToHex(toU8(link.traceId));
          if (link.spanId) link.spanId = bytesToHex(toU8(link.spanId));
        }
      }
    }
  }

  return obj as { resourceSpans: any[] };
}

function toU8(v: unknown): Uint8Array | undefined {
  if (!v) return undefined;
  if (v instanceof Uint8Array) return v;
  if (Array.isArray(v)) return Uint8Array.from(v as number[]);
  return undefined;
}
