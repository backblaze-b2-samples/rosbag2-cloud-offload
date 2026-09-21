"""Parquet (de)serialization for the session catalog.

pyarrow lives here on purpose: the repo/ layer is where third-party data-access
clients are contained (the structural test in tests/test_structure.py asserts
pyarrow is imported nowhere else, exactly as it does for boto3). pyarrow does
NOT own an S3 client here — it only turns rows into Parquet bytes and back. All
B2 I/O for the catalog object goes through the boto3 repo functions in
`b2_client`, so the custom user agent is carried on the one S3 client the app has.
"""

import io

import pyarrow as pa
import pyarrow.parquet as pq


def rows_to_parquet_bytes(rows: list[dict]) -> bytes:
    """Serialize catalog rows to Parquet bytes.

    An empty catalog still produces a valid (column-less) Parquet file so the
    object always exists to download. `from_pylist` infers the schema from the
    rows, including the `topic_set` list<string> column.
    """
    table = pa.Table.from_pylist(rows) if rows else pa.table({})
    buffer = io.BytesIO()
    pq.write_table(table, buffer)
    return buffer.getvalue()


def parquet_bytes_to_rows(data: bytes) -> list[dict]:
    """Read Parquet bytes back into a list of row dicts."""
    table = pq.read_table(io.BytesIO(data))
    return table.to_pylist()
