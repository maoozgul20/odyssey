"""Text embeddings and reranking, both small ONNX models that run on the CPU.

The models download once (about 67 MB and 80 MB) the first time they are used, then
load from the local cache.
"""

from __future__ import annotations

from functools import lru_cache

from .config import EMBED_MODEL, RERANK_MODEL


@lru_cache(maxsize=1)
def _embedder():
    from fastembed import TextEmbedding

    return TextEmbedding(EMBED_MODEL)


@lru_cache(maxsize=1)
def _reranker():
    from fastembed.rerank.cross_encoder import TextCrossEncoder

    return TextCrossEncoder(RERANK_MODEL)


def embed_passages(texts: list[str], batch_size: int = 64) -> list[list[float]]:
    return [v.tolist() for v in _embedder().passage_embed(texts, batch_size=batch_size)]


def embed_query(text: str) -> list[float]:
    # query_embed adds the instruction BGE models expect for search queries
    return next(iter(_embedder().query_embed(text))).tolist()


def rerank(query: str, docs: list[str]) -> list[float]:
    """A cross-encoder reads the question and each passage together and scores the pair."""
    if not docs:
        return []
    return [float(s) for s in _reranker().rerank(query, docs)]


def to_pgvector(v: list[float]) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in v) + "]"
