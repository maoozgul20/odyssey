"""A small connection pool to Supabase Postgres."""

from __future__ import annotations

from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

from .config import DATABASE_URL


def connect() -> psycopg.Connection:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set. Copy backend/.env.example to backend/.env and fill it in.")
    # prepare_threshold=None: needed for Supabase's connection pooler
    return psycopg.connect(DATABASE_URL, row_factory=dict_row, prepare_threshold=None, connect_timeout=15)


_conn: psycopg.Connection | None = None


@contextmanager
def cursor():
    """One shared connection for the API, reopened if it drops."""
    global _conn
    if _conn is None or _conn.closed:
        _conn = connect()
        _conn.autocommit = True
    try:
        with _conn.cursor() as cur:
            yield cur
    except psycopg.OperationalError:
        _conn = None
        raise
