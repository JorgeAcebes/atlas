import {
  handleMcpDelete,
  handleMcpGet,
  handleMcpOptions,
  handleMcpPost,
} from "@/lib/mcp-server";

export function OPTIONS() {
  return handleMcpOptions();
}

export async function GET(request: Request) {
  return handleMcpGet(request);
}

export async function POST(request: Request) {
  return handleMcpPost(request);
}

export function DELETE() {
  return handleMcpDelete();
}
