"""One real SDK stdio call used by browser/host acceptance, never a mock protocol."""
import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def call(credential: Path, name: str, arguments: dict) -> dict:
    params = StdioServerParameters(command=sys.executable, args=["-m", "backend.mcp_server",
                                  "--credential", str(credential), "--no-open"],
                                  env={**os.environ, "PYTHON_DOTENV_DISABLED": "1"})
    async with stdio_client(params) as (reader, writer):
        async with ClientSession(reader, writer) as session:
            await session.initialize()
            result = await session.call_tool(name, arguments)
            return result.structuredContent or {"error": {"code": "MISSING_RESULT"}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("credential", type=Path)
    parser.add_argument("name")
    args = parser.parse_args()
    arguments = json.loads(sys.stdin.read())
    print(json.dumps(asyncio.run(call(args.credential.resolve(), args.name, arguments))))


if __name__ == "__main__":
    main()
