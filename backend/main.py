import logging
import asyncio
import time
import uuid
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, field_validator


class ChatRequest(BaseModel):
    prompt: str
    systemInstruction: str | None = None
    modelName: str
    apiBaseUrl: str
    apiKey: str

    model_config = ConfigDict(str_strip_whitespace=True)

    @field_validator("prompt", "modelName", "apiBaseUrl", "apiKey")
    @classmethod
    def ensure_not_empty(cls, value: str) -> str:
        if not value:
            raise ValueError("field is required")
        return value


app = FastAPI(title="LifeKLine API")
logger = logging.getLogger("lifekline.backend")

if not logging.getLogger().handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def build_chat_completions_url(api_base_url: str) -> str:
    normalized = api_base_url.rstrip("/")
    if normalized.endswith("/chat/completions"):
        return normalized
    if normalized.endswith("/v1") or normalized.endswith("/api/coding/v3"):
        return f"{normalized}/chat/completions"
    return f"{normalized}/v1/chat/completions"


def extract_text_content(content: Any) -> str:
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        text_parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                text_parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    text_parts.append(text)
        if text_parts:
            return "".join(text_parts)

    raise HTTPException(status_code=502, detail="上游模型未返回可解析的文本内容。")


def get_retry_delay_seconds(response: httpx.Response, attempt: int) -> float:
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        try:
            return max(0.0, float(retry_after))
        except ValueError:
            pass
    return float(attempt)


async def post_with_retry(
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str],
    request_id: str,
) -> httpx.Response:
    last_error: Exception | None = None
    max_attempts = 4

    for attempt in range(1, max_attempts + 1):
        try:
            logger.info("[%s] 上游请求尝试 attempt=%s", request_id, attempt)
            async with httpx.AsyncClient(timeout=600, http2=False) as client:
                response = await client.post(url, json=payload, headers=headers)
            if response.status_code == 429 and attempt < max_attempts:
                delay = get_retry_delay_seconds(response, attempt)
                logger.warning(
                    "[%s] 上游返回 429 attempt=%s retry_in=%.2fs",
                    request_id,
                    attempt,
                    delay,
                )
                await asyncio.sleep(delay)
                continue
            return response
        except httpx.RequestError as exc:
            last_error = exc
            logger.warning(
                "[%s] 上游请求异常 attempt=%s error_type=%s error=%r",
                request_id,
                attempt,
                type(exc).__name__,
                exc,
            )
            if attempt < max_attempts:
                await asyncio.sleep(1.0 * attempt)

    assert last_error is not None
    raise last_error


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/chat")
async def chat(request: ChatRequest) -> dict[str, str]:
    request_id = uuid.uuid4().hex[:8]
    started_at = time.perf_counter()

    payload = {
        "model": request.modelName,
        "messages": [
            {"role": "system", "content": request.systemInstruction or ""},
            {"role": "user", "content": request.prompt},
        ],
    }

    url = build_chat_completions_url(request.apiBaseUrl)
    headers = {
        "Authorization": f"Bearer {request.apiKey}",
        "Content-Type": "application/json",
    }

    logger.info(
        "[%s] 收到推演请求 model=%s base_url=%s prompt_chars=%s system_chars=%s",
        request_id,
        request.modelName,
        request.apiBaseUrl,
        len(request.prompt),
        len(request.systemInstruction or ""),
    )
    logger.info("[%s] 开始请求上游模型接口 url=%s", request_id, url)

    try:
        response = await post_with_retry(url, payload, headers, request_id)
    except httpx.RequestError as exc:
        elapsed = time.perf_counter() - started_at
        logger.exception(
            "[%s] 上游请求异常 elapsed=%.2fs error_type=%s error=%r",
            request_id,
            elapsed,
            type(exc).__name__,
            exc,
        )
        raise HTTPException(
            status_code=502,
            detail=f"无法连接上游模型接口：{exc}",
        ) from exc

    elapsed = time.perf_counter() - started_at
    logger.info(
        "[%s] 上游响应 status=%s elapsed=%.2fs",
        request_id,
        response.status_code,
        elapsed,
    )

    if response.status_code >= 400:
        detail = response.text.strip() or "上游模型接口调用失败。"
        logger.error("[%s] 上游返回错误 body=%s", request_id, detail[:1000])
        raise HTTPException(status_code=response.status_code, detail=detail)

    try:
        data = response.json()
        content = data["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        logger.exception("[%s] 上游返回结构解析失败", request_id)
        raise HTTPException(
            status_code=502,
            detail="上游模型返回结构不符合 OpenAI 兼容格式。",
        ) from exc

    result = extract_text_content(content)
    logger.info(
        "[%s] 推演完成 result_chars=%s total_elapsed=%.2fs",
        request_id,
        len(result),
        time.perf_counter() - started_at,
    )
    return {"result": result}
