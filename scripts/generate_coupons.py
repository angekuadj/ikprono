#!/usr/bin/env python3
"""Persist generated FotMob coupons in the local SQLite idempotency store."""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Any

STORE_DB = Path(
    os.environ.get(
        "IKPRONO_COUPON_STORE_DB",
        str(Path.cwd() / ".coupon-data" / "generations.sqlite"),
    )
)


def save_once(payload: dict[str, Any]) -> dict[str, Any]:
    user_id = payload.get("userId")
    selection_id = payload.get("selectionId")
    fixture_ids = payload.get("fixtureIds")
    coupons = payload.get("coupons")
    if not isinstance(user_id, str) or not user_id or not isinstance(selection_id, str) or not selection_id:
        raise ValueError("Provide a user ID and selection ID.")
    if (
        not isinstance(fixture_ids, list)
        or not 1 <= len(fixture_ids) <= 20
        or not all(isinstance(fixture_id, str) and fixture_id for fixture_id in fixture_ids)
        or len(set(fixture_ids)) != len(fixture_ids)
    ):
        raise ValueError("Provide between 1 and 20 unique fixture IDs.")
    if not isinstance(coupons, list) or not coupons:
        raise ValueError("Provide generated coupons to save.")

    STORE_DB.parent.mkdir(parents=True, exist_ok=True)
    fixture_ids_json = json.dumps(fixture_ids, ensure_ascii=False, separators=(",", ":"))
    coupons_json = json.dumps(coupons, ensure_ascii=False, separators=(",", ":"))
    with sqlite3.connect(STORE_DB, timeout=30) as store:
        store.row_factory = sqlite3.Row
        store.execute("PRAGMA journal_mode = WAL")
        store.execute(
            """
            CREATE TABLE IF NOT EXISTS generated_coupons (
              user_id TEXT NOT NULL,
              selection_id TEXT NOT NULL,
              fixture_ids_json TEXT NOT NULL,
              coupons_json TEXT NOT NULL,
              generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (user_id, selection_id)
            )
            """
        )
        store.execute("BEGIN IMMEDIATE")
        existing = store.execute(
            """
            SELECT fixture_ids_json, coupons_json
            FROM generated_coupons
            WHERE user_id = ? AND selection_id = ?
            """,
            (user_id, selection_id),
        ).fetchone()
        if existing:
            if existing["fixture_ids_json"] != fixture_ids_json:
                raise ValueError("This selection ID is already linked to different fixtures.")
            return {"coupons": json.loads(existing["coupons_json"]), "alreadyGenerated": True}
        store.execute(
            """
            INSERT INTO generated_coupons (user_id, selection_id, fixture_ids_json, coupons_json)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, selection_id, fixture_ids_json, coupons_json),
        )
        return {"coupons": coupons, "alreadyGenerated": False}


def main() -> int:
    try:
        payload = json.loads(sys.argv[1])
        if not isinstance(payload, dict):
            raise ValueError("Invalid coupon persistence request.")
        print(json.dumps(save_once(payload), ensure_ascii=False, separators=(",", ":")))
        return 0
    except (IndexError, json.JSONDecodeError, TypeError, ValueError, sqlite3.Error) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
